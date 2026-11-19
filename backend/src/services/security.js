/**
 * Security: IP blocking, account locks, and the security event log.
 *
 * Two different "blocks" for a member — on purpose:
 *   LOCK     (locked_at)  "Is this really you?"  Set after too many wrong passwords, or by an admin.
 *                         The owner unlocks it themself with a code emailed to them (or by resetting
 *                         the password). Every session is signed out when it locks.
 *   SUSPEND  (status)     An admin decision. Only an admin can lift it. The member is emailed both ways.
 *
 * IP blocks: single addresses or ranges, added by admins or automatically (temporary) when one IP
 * fails sign-ins on many accounts. Kept in memory (a node:net BlockList), refreshed every 30 seconds
 * and right after any change, so checking a request costs nothing.
 */
import net from 'node:net';
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { createCode } from './codes.js';
import { sendAccountLockedEmail } from './email.js';
import { getSettings } from './settings.js';

/* --------------------------------- IPs --------------------------------- */

/** '::ffff:1.2.3.4' (IPv4 written as IPv6) → '1.2.3.4' */
export const normalizeIp = (ip) => String(ip ?? '').replace(/^::ffff:/i, '');

/** Parse "1.2.3.4" / "1.2.3.0/24" / "2001:db8::/32". Returns { address, prefix, family } or null if invalid. */
export function parseTarget(target) {
  const [rawAddress, rawPrefix, extra] = String(target).trim().split('/');
  if (extra !== undefined) return null;
  const address = normalizeIp(rawAddress);
  const version = net.isIP(address);
  if (!version) return null;
  const family = version === 4 ? 'ipv4' : 'ipv6';
  const max = version === 4 ? 32 : 128;
  if (rawPrefix === undefined) return { address, prefix: max, family };
  if (!/^\d{1,3}$/.test(rawPrefix)) return null;
  const prefix = Number(rawPrefix);
  if (prefix < (version === 4 ? 8 : 16) || prefix > max) return null; // refuse absurdly wide ranges (e.g. "0.0.0.0/0")
  return { address, prefix, family };
}

/** Does `target` (address or range) cover `ip`? */
export function targetCovers(target, ip) {
  const t = parseTarget(target);
  const address = normalizeIp(ip);
  if (!t || !net.isIP(address)) return false;
  const list = new net.BlockList();
  list.addSubnet(t.address, t.prefix, t.family);
  return list.check(address, net.isIP(address) === 4 ? 'ipv4' : 'ipv6');
}

let blockList = new net.BlockList();
let loadedAt = 0;
let loading = null;

/** Re-read the blocked IPs from the database (expired ones are ignored). */
export async function reloadBlockedIps() {
  const { rows } = await query(`SELECT target FROM blocked_ips WHERE expires_at IS NULL OR expires_at > now()`);
  const next = new net.BlockList();
  for (const { target } of rows) {
    const t = parseTarget(target);
    if (t) next.addSubnet(t.address, t.prefix, t.family);
  }
  blockList = next;
  loadedAt = Date.now();
}

export function isIpBlocked(ip) {
  const address = normalizeIp(ip);
  const version = net.isIP(address);
  return version ? blockList.check(address, version === 4 ? 'ipv4' : 'ipv6') : false;
}

/** Express middleware: refuse requests from blocked IPs (list refreshed every 30 s). */
export async function blockIps(req, _res, next) {
  if (Date.now() - loadedAt > 30_000) {
    loading ??= reloadBlockedIps()
      .catch((err) => console.error('could not load blocked IPs:', err.message))
      .finally(() => (loading = null));
    if (!loadedAt) await loading; // the very first request waits for the list
  }
  if (isIpBlocked(req.ip)) throw new HttpError(403, 'Access from your network has been blocked. If you think this is a mistake, contact support.', 'IP_BLOCKED');
  next();
}

/* ---------------------------- Security log ---------------------------- */

export async function recordEvent(kind, { ip, userId = null, email = null, detail = null } = {}) {
  await query(`INSERT INTO security_events (kind, ip, user_id, email, detail) VALUES ($1, $2, $3, $4, $5)`, [
    kind,
    ip ? normalizeIp(ip) : null,
    userId,
    email,
    detail,
  ]).catch((err) => console.error('security log failed:', err.message)); // logging must never break a request
}

/* ---------------------------- Failed sign-ins ---------------------------- */

/**
 * A wrong password. Counts it for the account (locks it at the admin's limit) and for the IP
 * (blocks the IP for a while if it is failing on many accounts). Returns true if the account just got locked.
 */
export async function onFailedLogin({ ip, member, email }) {
  const settings = await getSettings();
  await recordEvent('login_failed', { ip, userId: member?.id, email });

  // The IP: many failures across accounts in 15 minutes → temporary block
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM security_events WHERE ip = $1 AND kind = 'login_failed' AND created_at > now() - interval '15 minutes'`,
    [normalizeIp(ip)],
  );
  if (rows[0].n >= settings.security_ip_block_after) {
    const added = await query(
      `INSERT INTO blocked_ips (target, reason, auto, expires_at)
       VALUES ($1, 'Too many failed sign-ins', true, now() + make_interval(mins => $2))
       ON CONFLICT (target) DO NOTHING RETURNING id`,
      [normalizeIp(ip), settings.security_ip_block_minutes],
    );
    if (added.rows[0]) {
      await recordEvent('ip_auto_blocked', { ip, detail: `${rows[0].n} failed sign-ins in 15 minutes` });
      await reloadBlockedIps();
    }
  }

  // The account: N wrong passwords in a row → lock it and email the owner an unlock code
  if (!member) return false;
  const { rows: counted } = await query(
    `UPDATE members SET failed_logins = failed_logins + 1 WHERE id = $1 RETURNING failed_logins`,
    [member.id],
  );
  if (counted[0].failed_logins >= settings.security_lock_after && !member.locked_at) {
    await lockAccount(member.id, 'too_many_attempts', { ip });
    return true;
  }
  return false;
}

export async function onSuccessfulLogin(memberId) {
  await query('UPDATE members SET failed_logins = 0, last_active_at = now() WHERE id = $1', [memberId]);
}

/* ------------------------------ Account locks ------------------------------ */

/** Lock an account: sign out everywhere, email the owner a code to unlock it. */
export async function lockAccount(memberId, reason, { ip, by } = {}) {
  const { rows } = await query(
    `UPDATE members SET locked_at = now(), lock_reason = $2, token_version = token_version + 1, updated_at = now()
      WHERE id = $1 RETURNING email, name`,
    [memberId, reason],
  );
  const member = rows[0];
  if (!member) return;
  await recordEvent('account_locked', { ip, userId: memberId, email: member.email, detail: by ? `by ${by}` : reason });
  try {
    const code = await createCode(memberId, 'unlock');
    await sendAccountLockedEmail(member.email, member.name, code, reason);
  } catch (err) {
    console.error('unlock email failed:', err.message); // the owner can still ask for a new code
  }
}

export async function unlockAccount(memberId, { ip, by } = {}) {
  const { rows } = await query(
    `UPDATE members SET locked_at = NULL, lock_reason = NULL, failed_logins = 0, updated_at = now() WHERE id = $1 RETURNING email`,
    [memberId],
  );
  if (rows[0]) await recordEvent('account_unlocked', { ip, userId: memberId, email: rows[0].email, detail: by ? `by ${by}` : 'by owner' });
}

/* ------------------------------ Passwords ------------------------------ */

// The most common passwords (people really use these). Refused for new passwords.
const COMMON = new Set(
  `password password1 password123 12345678 123456789 1234567890 qwerty123 qwertyuiop 11111111 00000000 iloveyou
   abc12345 abcd1234 admin123 welcome1 welcome123 letmein1 sunshine1 princess1 football1 baseball1 monkey123
   dragon123 master123 trustno1 passw0rd p@ssw0rd 1q2w3e4r 1qaz2wsx zaq12wsx asdfghjk zxcvbnm1 india123
   anchor123 changeme 987654321 123123123 qwerty12 superman1 starwars1`.split(/\s+/),
);

/** Throws a 400 if the password is too weak. */
export function assertStrongPassword(password, email = '') {
  const p = String(password);
  const lower = p.toLowerCase();
  const local = String(email).split('@')[0].toLowerCase();
  if (COMMON.has(lower)) throw new HttpError(400, 'That password is too common. Choose something harder to guess.', 'WEAK_PASSWORD');
  if (/^(.)\1+$/.test(p)) throw new HttpError(400, 'A password can’t be one character repeated.', 'WEAK_PASSWORD');
  if (local.length >= 4 && lower.includes(local)) throw new HttpError(400, 'Your password shouldn’t contain your email name.', 'WEAK_PASSWORD');
}
