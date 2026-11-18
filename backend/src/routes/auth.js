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
import { sendPasswordResetCode, sendVerificationCode } from '../services/email.js';
import { ROLES } from '../services/roles.js';
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
});

authRouter.post('/register', ipCeiling, signupPerIp, async (req, res) => {
  const settings = await getSettings();
  if (settings.maintenance_mode) throw new HttpError(503, settings.maintenance_message, 'MAINTENANCE');
  if (!settings.signups_enabled) throw new HttpError(403, 'New sign-ups are paused right now. Please try again later.', 'SIGNUPS_CLOSED');
  const body = parse(registerSchema, req.body);
  const hash = await bcrypt.hash(body.password, 12);
  let user;
  try {
    user = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO members (email, password_hash, name, timezone, currency, terms_version, marketing_opt_in, interests)
         VALUES ($1, $2, $3, COALESCE($4, 'UTC'), COALESCE($5, 'USD'), $6, $7, $8) RETURNING id`,
        [body.email, hash, body.name, body.timezone ?? null, body.currency ?? null, config.termsVersion, body.marketingOptIn, body.interests],
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

authRouter.post('/login', ipCeiling, loginPerIpAccount, loginPerAccount, async (req, res) => {
  const body = parse(z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1) }), req.body);
  const { rows } = await query('SELECT id, password_hash, status FROM members WHERE email = $1', [body.email]);
  const row = rows[0];
  // Same message for unknown email and wrong password (don't reveal which accounts exist)
  const passwordOk = await bcrypt.compare(body.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !passwordOk)
    throw new HttpError(401, 'Wrong email or password', 'BAD_CREDENTIALS');
  if (row.status !== 'active') throw new HttpError(403, 'This account has been suspended. Contact support.', 'SUSPENDED');
  await query('UPDATE members SET last_active_at = now() WHERE id = $1', [row.id]);
  res.json(session(await loadUser(row.id)));
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
  const { rows } = await query('SELECT id FROM members WHERE email = $1 AND status = $2', [body.email, 'active']);
  if (!rows[0]) throw new HttpError(400, 'This code has expired. Request a new one.', 'CODE_EXPIRED');
  await consumeCode(rows[0].id, 'reset', body.code);
  await query(
    `UPDATE members SET password_hash = $2, token_version = token_version + 1,
       email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1`,
    [rows[0].id, await bcrypt.hash(body.password, 12)],
  );
  res.json(session(await loadUser(rows[0].id)));
});

authRouter.post('/change-password', requireAuth, perUser(10), async (req, res) => {
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: password }), req.body);
  const { rows } = await query('SELECT password_hash FROM members WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(body.currentPassword, rows[0].password_hash)))
    throw new HttpError(400, 'Current password is not correct', 'BAD_PASSWORD');
  await query('UPDATE members SET password_hash = $2, token_version = token_version + 1, updated_at = now() WHERE id = $1', [
    req.user.id,
    await bcrypt.hash(body.newPassword, 12),
  ]);
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
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = parse(updateSchema, req.body);
  await query(
    `UPDATE members SET name = COALESCE($2, name), timezone = COALESCE($3, timezone), currency = COALESCE($4, currency),
       marketing_opt_in = COALESCE($5, marketing_opt_in), interests = COALESCE($6, interests), updated_at = now()
     WHERE id = $1`,
    [req.user.id, body.name ?? null, body.timezone ?? null, body.currency ?? null, body.marketingOptIn ?? null, body.interests ?? null],
  );
  if (body.marketingOptIn !== undefined && body.marketingOptIn !== req.user.marketingOptIn)
    await query(`INSERT INTO consents (user_id, kind, granted) VALUES ($1, 'marketing', $2)`, [req.user.id, body.marketingOptIn]);
  res.json({ user: publicUser(stripTv(await loadUser(req.user.id))) });
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
