import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

const TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const hash = (code) => crypto.createHmac('sha256', config.jwtSecret).update(code).digest('hex');

/** Create a 6-digit one-time code (previous unused codes for the same purpose are invalidated). */
export async function createCode(userId, purpose) {
  const { rows: recent } = await query(
    `SELECT 1 FROM email_codes WHERE user_id = $1 AND purpose = $2
       AND created_at > now() - make_interval(secs => $3)`,
    [userId, purpose, RESEND_COOLDOWN_SECONDS],
  );
  if (recent.length) throw new HttpError(429, 'Please wait a minute before requesting another code', 'TOO_SOON');

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await query('UPDATE email_codes SET consumed_at = now() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL', [userId, purpose]);
  await query(
    `INSERT INTO email_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [userId, purpose, hash(code), TTL_MINUTES],
  );
  return code;
}

/** Verify and consume a code. Throws a 400 when invalid, expired, or out of attempts. */
export async function consumeCode(userId, purpose, code) {
  const { rows } = await query(
    `SELECT id, code_hash, attempts, expires_at < now() AS expired FROM email_codes
      WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose],
  );
  const row = rows[0];
  if (!row || row.expired || row.attempts >= MAX_ATTEMPTS)
    throw new HttpError(400, 'This code has expired. Request a new one.', 'CODE_EXPIRED');

  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hash(String(code))));
  if (!ok) {
    await query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    throw new HttpError(400, 'That code is not correct', 'CODE_INVALID');
  }
  await query('UPDATE email_codes SET consumed_at = now() WHERE id = $1', [row.id]);
}
