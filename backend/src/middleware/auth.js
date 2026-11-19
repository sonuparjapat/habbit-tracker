import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { can, isAdminRole, permissionsFor, ROLE_NAMES } from '../services/roles.js';
import { HttpError } from './errors.js';

export const USER_FIELDS = `id, email, name, role, status, timezone, currency, interests,
  marketing_opt_in AS "marketingOptIn", terms_version AS "termsVersion",
  (email_verified_at IS NOT NULL) AS "emailVerified", created_at AS "createdAt",
  nudge_push AS "nudgePush", nudge_email AS "nudgeEmail", (push_token IS NOT NULL) AS "hasPushToken", push_news AS "pushNews",
  (locked_at IS NOT NULL) AS "locked"`;

export function signToken(user) {
  return jwt.sign({ sub: user.id, tv: user.token_version ?? 0 }, config.jwtSecret, { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' });
}

/**
 * What clients receive about the signed-in user.
 * role: 1 = super admin, 2 = admin, 3 = user. Clients should use isAdmin / permissions, not compare numbers.
 */
export function publicUser(row) {
  const out = {
    ...row,
    roleName: ROLE_NAMES[row.role] ?? 'user',
    isAdmin: isAdminRole(row.role),
    termsOutdated: row.termsVersion !== config.termsVersion,
  };
  if (out.isAdmin) out.permissions = permissionsFor(row.role);
  return out;
}

/**
 * Like requireAuth, but never fails: sets req.user when a valid session is present
 * (used by endpoints guests may call too, e.g. sending feedback).
 */
export async function optionalAuth(req, res, next) {
  if (!req.headers.authorization?.startsWith('Bearer ')) return next();
  try {
    await requireAuth(req, res, () => {});
  } catch {
    req.user = undefined;
  }
  next();
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Not signed in', 'UNAUTHENTICATED');

  let payload;
  try {
    // Only accept tokens signed the way we sign them (blocks 'alg: none' and algorithm-swap tricks)
    payload = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again', 'UNAUTHENTICATED');
  }

  // Update last_active_at at most every 10 minutes (cheap "active users" metric)
  await query(
    `UPDATE members SET last_active_at = now()
      WHERE id = $1 AND (last_active_at IS NULL OR last_active_at < now() - interval '10 minutes')`,
    [payload.sub],
  );
  const { rows } = await query(`SELECT ${USER_FIELDS}, token_version FROM members WHERE id = $1`, [payload.sub]);

  const user = rows[0];
  if (!user || user.token_version !== (payload.tv ?? 0))
    throw new HttpError(401, 'Session expired, please sign in again', 'UNAUTHENTICATED');
  if (user.status !== 'active') throw new HttpError(403, 'This account has been suspended', 'SUSPENDED');
  if (user.locked) throw new HttpError(423, 'Your account is locked for your safety. Check your email to unlock it.', 'ACCOUNT_LOCKED');

  req.user = user;
  next();
}

/** Super admins (1) and admins (2). */
export function requireAdmin(req, _res, next) {
  if (!isAdminRole(req.user?.role)) throw new HttpError(403, 'Admins only', 'FORBIDDEN');
  next();
}

/** Route-level permission check, e.g. requirePermission(PERMISSIONS.AUDIT_VIEW). */
export const requirePermission = (permission) => (req, _res, next) => {
  if (!can(req.user?.role, permission)) throw new HttpError(403, 'You don’t have permission to do this', 'FORBIDDEN');
  next();
};
