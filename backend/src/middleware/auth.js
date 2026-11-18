import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { HttpError } from './errors.js';

export const USER_FIELDS = `id, email, name, role, status, timezone, currency, interests,
  marketing_opt_in AS "marketingOptIn", terms_version AS "termsVersion",
  (email_verified_at IS NOT NULL) AS "emailVerified", created_at AS "createdAt"`;

export function signToken(user) {
  return jwt.sign({ sub: user.id, tv: user.token_version ?? 0 }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** Adds the fields the app needs to decide what to show (e.g. re-accept updated terms). */
export function publicUser(row) {
  return { ...row, termsOutdated: row.termsVersion !== config.termsVersion };
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Not signed in', 'UNAUTHENTICATED');

  let payload;
  try {
    payload = jwt.verify(header.slice(7), config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again', 'UNAUTHENTICATED');
  }

  // Update last_active_at at most every 10 minutes (cheap "active users" metric)
  const { rows } = await query(
    `UPDATE users SET last_active_at = now()
      WHERE id = $1 AND (last_active_at IS NULL OR last_active_at < now() - interval '10 minutes')`,
    [payload.sub],
  ).then(() => query(`SELECT ${USER_FIELDS}, token_version FROM users WHERE id = $1`, [payload.sub]));

  const user = rows[0];
  if (!user || user.token_version !== (payload.tv ?? 0))
    throw new HttpError(401, 'Session expired, please sign in again', 'UNAUTHENTICATED');
  if (user.status !== 'active') throw new HttpError(403, 'This account has been suspended', 'SUSPENDED');

  req.user = user;
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw new HttpError(403, 'Admins only', 'FORBIDDEN');
  next();
}
