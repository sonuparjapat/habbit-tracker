/**
 * Accounts: sign up, sign in, email verification, passwords and the member's own profile.
 *
 *   POST   /api/auth/register              create an account (sends a 6-digit email code)
 *   POST   /api/auth/login                 sign in → { token, user }  (423 ACCOUNT_LOCKED if locked for safety)
 *   POST   /api/auth/unlock/request        email a new unlock code to a locked account
 *   POST   /api/auth/unlock                unlock my account with the emailed code → { token, user }
 *   POST   /api/auth/verify-email          confirm the email with the 6-digit code
 *   POST   /api/auth/resend-verification   send a new code
 *   POST   /api/auth/forgot-password       email a reset code (same reply whether or not the email exists)
 *   POST   /api/auth/reset-password        set a new password with the code
 *   POST   /api/auth/change-password       change password while signed in
 *   POST   /api/auth/logout-all            sign out on every device (bumps token_version)
 *   GET    /api/auth/me                    my profile
 *   PATCH  /api/auth/me                    edit name, timezone, currency, interests, evening check-in…
 *   PUT    /api/auth/me/push-token         save (or clear, with null) this phone's push token
 *   POST   /api/auth/accept-terms          accept the latest terms
 *   GET    /api/auth/me/invites            my invite code and how many friends joined with it
 *   GET    /api/auth/me/export             download all my data (JSON)
 *   DELETE /api/auth/me                    delete my account and all its data
 *
 * Rate limits are per account / per email (not per IP), so people sharing a mobile network
 * don't block each other.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { publicUser, requireAuth, signToken, USER_FIELDS } from '../middleware/auth.js';
import { HttpError, parse } from '../middleware/errors.js';
import { CATEGORY_KEYS } from '../services/catalog.js';
import { consumeCode, createCode } from '../services/codes.js';
import { sendAccountLockedEmail, sendPasswordChangedEmail, sendPasswordResetCode, sendVerificationCode } from '../services/email.js';
import { isExpoPushToken } from '../services/push.js';
import { ROLES } from '../services/roles.js';
import { assertStrongPassword, onFailedLogin, onSuccessfulLogin, recordEvent, unlockAccount } from '../services/security.js';
import { getSettings } from '../services/settings.js';
import { isValidTimeZone } from '../utils/date.js';

export const authRouter = Router();

/* ------------------------------- Rate limits -------------------------------
 * Mobile carriers put thousands of people behind one IP, so per-IP limits must be generous.
 * Brute force is stopped per *account* instead, and email sending per *address*.
 */
const MIN = 60 * 1000;
const make = (limit, keyGenerator, windowMs = 15 * MIN) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } }),
  });
const byIp = (req) => ipKeyGenerator(req.ip);
const emailOf = (req) => String(req.body?.email ?? '').trim().toLowerCase();
const byEmail = (req) => (emailOf(req) ? `email:${emailOf(req)}` : byIp(req));
const byIpAndEmail = (req) => `${byIp(req)}|${emailOf(req)}`;
const byUser = (req) => (req.user ? `user:${req.user.id}` : byIp(req));

const ipCeiling = make(300, byIp); // shared-IP friendly ceiling for all public auth endpoints
const loginPerIpAccount = make(10, byIpAndEmail); // password guessing from one place
const loginPerAccount = make(30, byEmail); // password guessing spread over many IPs
const signupPerIp = make(30, byIp, 60 * MIN);
const emailPerAddress = make(5, byEmail); // reset codes: no inbox flooding, no code guessing
const perUser = (limit, windowMs) => make(limit, byUser, windowMs);

// A real bcrypt hash of a random string, compared against when the email doesn't exist,
// so a login takes the same time whether or not the account exists
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-' + Math.random(), 12);

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const timezone = z.string().refine(isValidTimeZone, 'Unknown timezone');
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code');
const interests = z.array(z.enum(CATEGORY_KEYS)).max(CATEGORY_KEYS.length);
const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

async function loadUser(id, db = { query }) {
  const { rows } = await db.query(`SELECT ${USER_FIELDS}, token_version FROM members WHERE id = $1`, [id]);
  return rows[0];
}

function session(user) {
  const { token_version, ...rest } = user;
  return { token: signToken({ id: user.id, token_version }), user: publicUser(rest) };
}

/** Email failures must never block sign-up; log and continue. */
async function safeSend(fn) {
  try {
    await fn();
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

/* ------------------------------- Sign up / in ------------------------------- */

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(60),
  email,
  password,
  acceptTerms: z.literal(true, { error: 'You must accept the Terms and Privacy Policy' }),
  marketingOptIn: z.boolean().default(false),
  timezone: timezone.optional(),
  currency: currency.optional(),
  interests: interests.default([]),
  /** A friend's invite code (optional) */
  inviteCode: z.string().trim().toUpperCase().max(20).optional(),
});

/** A short code people can type: no 0/O or 1/I to mix up. */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
async function newReferralCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from(crypto.randomBytes(8), (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
    const { rows } = await query('SELECT 1 FROM members WHERE referral_code = $1', [code]);
    if (!rows[0]) return code;
  }
  throw new Error('could not create an invite code');
}

authRouter.post('/register', ipCeiling, signupPerIp, async (req, res) => {
  const settings = await getSettings();
  if (settings.maintenance_mode) throw new HttpError(503, settings.maintenance_message, 'MAINTENANCE');
  if (!settings.signups_enabled) throw new HttpError(403, 'New sign-ups are paused right now. Please try again later.', 'SIGNUPS_CLOSED');
  const body = parse(registerSchema, req.body);
  assertStrongPassword(body.password, body.email);

  // A friend's invite code must be real (a typo would otherwise silently lose the reward)
  let referredBy = null;
  if (body.inviteCode) {
    const { rows } = await query("SELECT id FROM members WHERE referral_code = $1 AND status = 'active'", [body.inviteCode]);
    if (!rows[0]) throw new HttpError(400, 'That invite code doesn’t exist. Check it, or leave it empty.', 'INVITE_INVALID');
    referredBy = rows[0].id;
  }
  const referralCode = await newReferralCode();
  const hash = await bcrypt.hash(body.password, 12);
  let user;
  try {
    user = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO members (email, password_hash, name, timezone, currency, terms_version, marketing_opt_in, interests, referral_code, referred_by)
         VALUES ($1, $2, $3, COALESCE($4, 'UTC'), COALESCE($5, 'USD'), $6, $7, $8, $9, $10) RETURNING id`,
        [body.email, hash, body.name, body.timezone ?? null, body.currency ?? null, config.termsVersion, body.marketingOptIn, body.interests, referralCode, referredBy],
      );
      const id = rows[0].id;
      await db.query(
        `INSERT INTO consents (user_id, kind, version, granted) VALUES
           ($1, 'terms', $2, true), ($1, 'privacy', $2, true), ($1, 'marketing', NULL, $3)`,
        [id, config.termsVersion, body.marketingOptIn],
      );
      return loadUser(id, db);
    });
  } catch (err) {
    if (err?.code === '23505') throw new HttpError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    throw err;
  }
  await safeSend(async () => sendVerificationCode(user.email, user.name, await createCode(user.id, 'verify')));
  res.status(201).json(session(user));
});

const LOCKED_MESSAGE = 'Your account is locked for your safety. We emailed you a code to unlock it.';

/**
 * POST /api/auth/login
 * Order matters:
 *   1. Always run bcrypt (even for unknown emails) so the reply time doesn't reveal which accounts exist.
 *   2. A locked account says so whatever the password was — so a lock can't be used to test guesses.
 *   3. Wrong password → counted (may lock the account / block the IP). Same message for unknown emails.
 *   4. Suspended by an admin → told so (only after the right password, so it doesn't leak to strangers).
 */
authRouter.post('/login', ipCeiling, loginPerIpAccount, loginPerAccount, async (req, res) => {
  const body = parse(z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().min(1).max(128) }), req.body);
  const { rows } = await query('SELECT id, password_hash, status, locked_at, suspend_reason FROM members WHERE email = $1', [body.email]);
  const member = rows[0];
  const passwordOk = await bcrypt.compare(body.password, member?.password_hash ?? DUMMY_HASH);

  if (member?.locked_at) throw new HttpError(423, LOCKED_MESSAGE, 'ACCOUNT_LOCKED');

  if (!member || !passwordOk) {
    const lockedNow = await onFailedLogin({ ip: req.ip, member, email: body.email });
    if (lockedNow) throw new HttpError(423, LOCKED_MESSAGE, 'ACCOUNT_LOCKED');
    throw new HttpError(401, 'Wrong email or password', 'BAD_CREDENTIALS');
  }

  if (member.status !== 'active') {
    const why = member.suspend_reason ? ` Reason: ${member.suspend_reason}` : '';
    throw new HttpError(403, `This account has been suspended.${why} Contact support if you think this is a mistake.`, 'SUSPENDED');
  }
  await onSuccessfulLogin(member.id);
  res.json(session(await loadUser(member.id)));
});

/* ------------------------------ Account unlock ------------------------------ */

/** POST /api/auth/unlock/request — email a fresh unlock code (same reply whether or not the account exists / is locked). */
authRouter.post('/unlock/request', ipCeiling, emailPerAddress, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const { rows } = await query('SELECT id, name, locked_at, lock_reason FROM members WHERE email = $1', [body.email]);
  if (rows[0]?.locked_at) {
    try {
      const c = await createCode(rows[0].id, 'unlock');
      await safeSend(() => sendAccountLockedEmail(body.email, rows[0].name, c, rows[0].lock_reason));
    } catch (err) {
      if (err.code !== 'TOO_SOON') throw err;
    }
  }
  res.json({ ok: true, message: 'If this account is locked, we’ve emailed a new unlock code.' });
});

/** POST /api/auth/unlock — the owner proves it's them with the emailed code; the account unlocks and they're signed in. */
authRouter.post('/unlock', ipCeiling, emailPerAddress, async (req, res) => {
  const body = parse(z.object({ email, code }), req.body);
  const { rows } = await query('SELECT id, status, locked_at FROM members WHERE email = $1', [body.email]);
  const member = rows[0];
  if (!member?.locked_at) throw new HttpError(400, 'This code has expired. Request a new one.', 'CODE_EXPIRED');
  await consumeCode(member.id, 'unlock', body.code);
  await unlockAccount(member.id, { ip: req.ip });
  // Unlocking proves the email, but an admin suspension still stands
  if (member.status !== 'active') throw new HttpError(403, 'Your account is unlocked, but it has been suspended by our team. Contact support.', 'SUSPENDED');
  res.json(session(await loadUser(member.id)));
});

/* ------------------------------ Email verification ------------------------------ */

authRouter.post('/verify-email', requireAuth, perUser(30), async (req, res) => {
  const body = parse(z.object({ code }), req.body);
  if (req.user.emailVerified) {
    res.json({ user: publicUser(stripTv(req.user)) });
    return;
  }
  await consumeCode(req.user.id, 'verify', body.code);
  await query('UPDATE members SET email_verified_at = now(), updated_at = now() WHERE id = $1', [req.user.id]);
  res.json({ user: publicUser(stripTv(await loadUser(req.user.id))) });
});

authRouter.post('/resend-verification', requireAuth, perUser(5, 60 * MIN), async (req, res) => {
  if (req.user.emailVerified) throw new HttpError(400, 'Email is already verified', 'ALREADY_VERIFIED');
  const c = await createCode(req.user.id, 'verify');
  await sendVerificationCode(req.user.email, req.user.name, c);
  res.json({ ok: true });
});

/* -------------------------------- Passwords -------------------------------- */

authRouter.post('/forgot-password', ipCeiling, emailPerAddress, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const { rows } = await query(`SELECT id, name, status FROM members WHERE email = $1`, [body.email]);
  // Always respond the same way so this endpoint can't be used to discover accounts
  if (rows[0]?.status === 'active') {
    try {
      const c = await createCode(rows[0].id, 'reset');
      await safeSend(() => sendPasswordResetCode(body.email, rows[0].name, c));
    } catch (err) {
      if (err.code !== 'TOO_SOON') throw err;
    }
  }
  res.json({ ok: true, message: 'If an account exists for this email, a reset code has been sent.' });
});

authRouter.post('/reset-password', ipCeiling, emailPerAddress, async (req, res) => {
  const body = parse(z.object({ email, code, password }), req.body);
  assertStrongPassword(body.password, body.email);
  const { rows } = await query('SELECT id FROM members WHERE email = $1 AND status = $2', [body.email, 'active']);
  if (!rows[0]) throw new HttpError(400, 'This code has expired. Request a new one.', 'CODE_EXPIRED');
  await consumeCode(rows[0].id, 'reset', body.code);
  await query(
    // Resetting the password with an emailed code proves ownership, so it also unlocks a locked account
    `UPDATE members SET password_hash = $2, token_version = token_version + 1, locked_at = NULL, lock_reason = NULL, failed_logins = 0,
       email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1`,
    [rows[0].id, await bcrypt.hash(body.password, 12)],
  );
  await recordEvent('password_reset', { ip: req.ip, userId: rows[0].id, email: body.email });
  res.json(session(await loadUser(rows[0].id)));
});

authRouter.post('/change-password', requireAuth, perUser(10), async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
  const { rows } = await query('SELECT password_hash FROM members WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(body.currentPassword, rows[0].password_hash)))
    throw new HttpError(400, 'Current password is not correct', 'BAD_PASSWORD');
  if (body.newPassword === body.currentPassword) throw new HttpError(400, 'Choose a password different from your current one', 'SAME_PASSWORD');
  assertStrongPassword(body.newPassword, req.user.email);
  await query('UPDATE members SET password_hash = $2, token_version = token_version + 1, updated_at = now() WHERE id = $1', [
    req.user.id,
    await bcrypt.hash(body.newPassword, 12),
  ]);
  await recordEvent('password_changed', { ip: req.ip, userId: req.user.id, email: req.user.email });
  await safeSend(() => sendPasswordChangedEmail(req.user.email, req.user.name));
  // Other devices are signed out; this one gets a fresh token
  res.json(session(await loadUser(req.user.id)));
});

authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await query('UPDATE members SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  res.json({ ok: true });
});

/* --------------------------------- Profile --------------------------------- */

function stripTv(u) {
  const { token_version, ...rest } = u;
  return rest;
}

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(stripTv(req.user)) });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  timezone: timezone.optional(),
  currency: currency.optional(),
  marketingOptIn: z.boolean().optional(),
  interests: interests.optional(),
  /** Evening check-in: phone notification / email when a tracker was missed */
  nudgePush: z.boolean().optional(),
  nudgeEmail: z.boolean().optional(),
  /** News & tips notifications sent by the team */
  pushNews: z.boolean().optional(),
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = parse(updateSchema, req.body);
  await query(
    `UPDATE members SET name = COALESCE($2, name), timezone = COALESCE($3, timezone), currency = COALESCE($4, currency),
       marketing_opt_in = COALESCE($5, marketing_opt_in), interests = COALESCE($6, interests),
       nudge_push = COALESCE($7, nudge_push), nudge_email = COALESCE($8, nudge_email),
       push_news = COALESCE($9, push_news), updated_at = now()
     WHERE id = $1`,
    [
      req.user.id,
      body.name ?? null,
      body.timezone ?? null,
      body.currency ?? null,
      body.marketingOptIn ?? null,
      body.interests ?? null,
      body.nudgePush ?? null,
      body.nudgeEmail ?? null,
      body.pushNews ?? null,
    ],
  );
  if (body.marketingOptIn !== undefined && body.marketingOptIn !== req.user.marketingOptIn)
    await query(`INSERT INTO consents (user_id, kind, granted) VALUES ($1, 'marketing', $2)`, [req.user.id, body.marketingOptIn]);
  res.json({ user: publicUser(stripTv(await loadUser(req.user.id))) });
});

/** GET /api/auth/me/invites — friends count once they verify their email (stops fake sign-ups). */
authRouter.get('/me/invites', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE email_verified_at IS NOT NULL)::int AS joined, count(*)::int AS signed_up
       FROM members WHERE referred_by = $1`,
    [req.user.id],
  );
  // Accounts made by `npm run create-admin` start without a code
  let code = req.user.referralCode;
  if (!code) {
    code = await newReferralCode();
    await query('UPDATE members SET referral_code = $2 WHERE id = $1 AND referral_code IS NULL', [req.user.id, code]);
  }
  const settings = await getSettings();
  res.json({ code, joined: rows[0].joined, pending: rows[0].signed_up - rows[0].joined, xpPerFriend: settings.xp_referral });
});

/** PUT /api/auth/me/push-token — the app sends its Expo push token (or null when signing out). */
authRouter.put('/me/push-token', requireAuth, async (req, res) => {
  const { token } = parse(
    z.object({ token: z.string().max(200).refine(isExpoPushToken, 'Not an Expo push token').nullable() }),
    req.body,
  );
  await query('UPDATE members SET push_token = $2, updated_at = now() WHERE id = $1', [req.user.id, token]);
  res.status(204).end();
});

/** Re-accept after the Terms / Privacy Policy change. */
authRouter.post('/accept-terms', requireAuth, async (req, res) => {
  await query('UPDATE members SET terms_version = $2, updated_at = now() WHERE id = $1', [req.user.id, config.termsVersion]);
  await query(
    `INSERT INTO consents (user_id, kind, version, granted) VALUES ($1, 'terms', $2, true), ($1, 'privacy', $2, true)`,
    [req.user.id, config.termsVersion],
  );
  res.json({ user: publicUser(stripTv(await loadUser(req.user.id))) });
});

/** Download everything we store about the user (data portability). */
authRouter.get('/me/export', requireAuth, perUser(5, 60 * MIN), async (req, res) => {
  const id = req.user.id;
  const [trackers, entries, trades, expenses, breaks, consents] = await Promise.all([
    query('SELECT * FROM trackers WHERE user_id = $1', [id]),
    query('SELECT * FROM daily_entries WHERE user_id = $1', [id]),
    query('SELECT * FROM trades WHERE user_id = $1', [id]),
    query('SELECT * FROM expenses WHERE user_id = $1', [id]),
    query('SELECT * FROM rule_breaks WHERE user_id = $1', [id]),
    query('SELECT kind, version, granted, created_at FROM consents WHERE user_id = $1 ORDER BY created_at', [id]),
  ]);
  res.setHeader('Content-Disposition', 'attachment; filename="anchor-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    user: stripTv(req.user),
    consents: consents.rows,
    trackers: trackers.rows,
    dailyEntries: entries.rows,
    trades: trades.rows,
    expenses: expenses.rows,
    ruleBreaks: breaks.rows,
  });
});

/** Permanently delete the account and all its data (required by Play Store). */
authRouter.delete('/me', requireAuth, perUser(10), async (req, res) => {
  const body = parse(z.object({ password: z.string().min(1, 'Enter your password to confirm') }), req.body ?? {});
  const { rows } = await query('SELECT password_hash FROM members WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(body.password, rows[0].password_hash)))
    throw new HttpError(400, 'Password is not correct', 'BAD_PASSWORD');
  // Never leave the system without a super admin
  if (req.user.role === ROLES.SUPER_ADMIN) {
    const { rows: others } = await query('SELECT count(*) AS n FROM members WHERE role = $1 AND id <> $2', [ROLES.SUPER_ADMIN, req.user.id]);
    if (others[0].n === 0)
      throw new HttpError(400, 'You are the only super admin. Make someone else a super admin first (npm run create-admin).', 'LAST_SUPER_ADMIN');
  }
  await query('DELETE FROM members WHERE id = $1', [req.user.id]);
  res.status(204).end();
});
