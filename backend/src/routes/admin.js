/**
 * Admin API — for super admins (role 1) and admins (role 2), gated per route by permissions
 * (see src/services/roles.js). Privacy rule: staff see accounts and aggregate counts,
 * never the content of a user's trades, journals or expenses.
 *
 *   GET    /api/admin/overview                  counts for the dashboard
 *   GET    /api/admin/users                     search / filter / page through members
 *   GET    /api/admin/users/:id                 one member
 *   PATCH  /api/admin/users/:id                 change role, suspend (with a reason) / reactivate — the member is emailed
 *   POST   /api/admin/users/:id/lock            lock for safety: signed out, emailed a code to unlock it themself
 *   POST   /api/admin/users/:id/unlock          unlock a locked account
 *   POST   /api/admin/users/:id/logout          sign them out everywhere
 *   POST   /api/admin/users/:id/verify-email    mark their email verified
 *   DELETE /api/admin/users/:id                 delete the account
 *   GET    /api/admin/templates                 tracker templates
 *   POST   /api/admin/templates                 add a template
 *   PATCH  /api/admin/templates/:id             edit a template
 *   DELETE /api/admin/templates/:id             delete a template
 *   GET    /api/admin/starter-packs             starter packs (bundles of templates)
 *   POST   /api/admin/starter-packs             add a pack
 *   PATCH  /api/admin/starter-packs/:id         edit / show / hide a pack
 *   DELETE /api/admin/starter-packs/:id         delete (built-in packs are hidden instead)
 *   GET    /api/admin/audit-logs                who did what, when (?q= search, ?page=)
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requirePermission, USER_FIELDS } from '../middleware/auth.js';
import { HttpError, isUuid, parse } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { CATEGORY_KEYS } from '../services/catalog.js';
import { can, PERMISSIONS, ROLE_NAMES, ROLES } from '../services/roles.js';
import { sendAccountStatusEmail } from '../services/email.js';
import { lockAccount, unlockAccount } from '../services/security.js';
import { isDefaultPack, PACK_FIELDS } from '../services/starterPacks.js';
import { parseConfig } from '../services/trackerConfig.js';
import { listParams, pageInfo } from '../utils/listing.js';

export const adminRouter = Router();
const P = PERMISSIONS;

/** Who may act on whom. Super admins are only changed with the server command (npm run create-admin). */
function assertCanActOn(req, target, { allowSelf = false } = {}) {
  if (!allowSelf && target.id === req.user.id) throw new HttpError(400, 'You cannot do this to your own account', 'SELF');
  if (target.role === ROLES.SUPER_ADMIN && target.id !== req.user.id)
    throw new HttpError(403, 'Super admin accounts can only be changed from the server', 'FORBIDDEN');
  if (target.role === ROLES.ADMIN && !can(req.user.role, P.ADMINS_MANAGE))
    throw new HttpError(403, 'Only a super admin can change admin accounts', 'FORBIDDEN');
}


/* -------------------------------- Overview -------------------------------- */

adminRouter.get('/overview', requirePermission(P.DASHBOARD_VIEW), async (_req, res) => {
  const [users, trackers, activity, signups, categories] = await Promise.all([
    query(`SELECT
        count(*) AS total,
        count(*) FILTER (WHERE email_verified_at IS NOT NULL) AS verified,
        count(*) FILTER (WHERE status = 'suspended') AS suspended,
        count(*) FILTER (WHERE created_at > now() - interval '7 days') AS new7d,
        count(*) FILTER (WHERE created_at > now() - interval '30 days') AS new30d,
        count(*) FILTER (WHERE last_active_at > now() - interval '1 day') AS active1d,
        count(*) FILTER (WHERE last_active_at > now() - interval '7 days') AS active7d,
        count(*) FILTER (WHERE last_active_at > now() - interval '30 days') AS active30d,
        count(*) FILTER (WHERE marketing_opt_in) AS marketing,
        count(*) FILTER (WHERE role < 3) AS staff
      FROM members`),
    query(`SELECT type, count(*) AS n FROM trackers WHERE NOT archived GROUP BY type`),
    query(`SELECT
        (SELECT count(*) FROM trades) AS trades,
        (SELECT count(*) FROM expenses) AS expenses,
        (SELECT count(*) FROM daily_entries) AS checkins,
        (SELECT count(*) FROM rule_breaks) AS rule_breaks,
        (SELECT count(*) FROM daily_entries WHERE created_at > now() - interval '1 day') AS checkins1d`),
    query(`SELECT to_char(d, 'YYYY-MM-DD') AS date, count(u.id) AS n
             FROM generate_series(current_date - 29, current_date, interval '1 day') d
             LEFT JOIN members u ON u.created_at::date = d::date
            GROUP BY d ORDER BY d`),
    query(`SELECT category, count(*) AS n FROM trackers WHERE NOT archived GROUP BY category ORDER BY n DESC`),
  ]);
  res.json({
    users: users.rows[0],
    trackersByType: Object.fromEntries(trackers.rows.map((r) => [r.type, r.n])),
    trackersByCategory: categories.rows,
    activity: activity.rows[0],
    signups: signups.rows,
  });
});

/* ---------------------------------- Users ---------------------------------- */

adminRouter.get('/users', requirePermission(P.USERS_VIEW), async (req, res) => {
  const q = parse(
    z.object({
      search: z.string().trim().max(100).optional(),
      status: z.enum(['active', 'suspended']).optional(),
      role: z.coerce.number().int().min(1).max(3).optional(), // 1 super admin · 2 admin · 3 user
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
    req.query,
  );
  const where = [];
  const params = [];
  if (q.search) {
    params.push(`%${q.search.replace(/[%_]/g, '\\$&')}%`);
    where.push(`(u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
  }
  if (q.status) {
    params.push(q.status);
    where.push(`u.status = $${params.length}`);
  }
  if (q.role) {
    params.push(q.role);
    where.push(`u.role = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ rows }, { rows: total }] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.timezone, u.currency,
              (u.email_verified_at IS NOT NULL) AS "emailVerified", u.created_at AS "createdAt",
              u.last_active_at AS "lastActiveAt",
              (u.locked_at IS NOT NULL) AS "locked",
              (SELECT count(*) FROM trackers t WHERE t.user_id = u.id) AS trackers
         FROM members u ${whereSql}
        ORDER BY u.created_at DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
      params,
    ),
    query(`SELECT count(*) AS n FROM members u ${whereSql}`, params),
  ]);
  res.json({ users: rows, total: total[0].n, page: q.page, limit: q.limit });
});

async function getUser(id) {
  if (!isUuid(id)) throw new HttpError(404, 'User not found', 'NOT_FOUND');
  const { rows } = await query(
    `SELECT ${USER_FIELDS}, last_active_at AS "lastActiveAt", locked_at AS "lockedAt", lock_reason AS "lockReason",
            suspend_reason AS "suspendReason", failed_logins AS "failedLogins"
       FROM members WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, 'User not found', 'NOT_FOUND');
  return rows[0];
}

adminRouter.get('/users/:id', requirePermission(P.USERS_VIEW), async (req, res) => {
  const user = await getUser(req.params.id);
  const [trackers, counts, consents] = await Promise.all([
    query(`SELECT id, type, category, name, archived, created_at AS "createdAt" FROM trackers WHERE user_id = $1 ORDER BY created_at`, [user.id]),
    query(
      `SELECT (SELECT count(*) FROM trades WHERE user_id = $1) AS trades,
              (SELECT count(*) FROM expenses WHERE user_id = $1) AS expenses,
              (SELECT count(*) FROM daily_entries WHERE user_id = $1) AS checkins,
              (SELECT count(*) FROM rule_breaks WHERE user_id = $1) AS "ruleBreaks"`,
      [user.id],
    ),
    query(`SELECT kind, version, granted, created_at AS "createdAt" FROM consents WHERE user_id = $1 ORDER BY created_at DESC`, [user.id]),
  ]);
  res.json({ user, trackers: trackers.rows, counts: counts.rows[0], consents: consents.rows });
});

adminRouter.patch('/users/:id', requirePermission(P.USERS_MANAGE), async (req, res) => {
  const user = await getUser(req.params.id);
  // Role 1 (super admin) can never be granted through the API
  const body = parse(
    z.object({
      status: z.enum(['active', 'suspended']).optional(),
      /** Shown to the member (email + sign-in screen) when suspending */
      reason: z.string().trim().max(300).optional(),
      role: z.union([z.literal(ROLES.ADMIN), z.literal(ROLES.USER)]).optional(),
    }),
    req.body,
  );
  assertCanActOn(req, user);
  if (body.role !== undefined && body.role !== user.role && !can(req.user.role, P.ADMINS_MANAGE))
    throw new HttpError(403, 'Only a super admin can change roles', 'FORBIDDEN');
  const statusChanged = body.status !== undefined && body.status !== user.status;
  await query(
    `UPDATE members SET status = COALESCE($2, status), role = COALESCE($3, role), updated_at = now(),
       suspend_reason = CASE WHEN $2 = 'suspended' THEN $4 WHEN $2 = 'active' THEN NULL ELSE suspend_reason END,
       token_version = token_version + CASE WHEN $2 = 'suspended' THEN 1 ELSE 0 END
     WHERE id = $1`,
    [user.id, body.status ?? null, body.role ?? null, body.reason || null],
  );
  // Tell the member (never blocks the admin action if email fails)
  if (statusChanged) {
    await sendAccountStatusEmail(user.email, user.name, body.status, body.reason).catch((err) => console.error('status email failed:', err.message));
  }
  await audit(req, 'user.update', 'user', user.id, { email: user.email, ...body, ...(body.role ? { role: ROLE_NAMES[body.role] } : {}) });
  res.json({ user: await getUser(user.id) });
});

/** Lock for safety — the member is signed out everywhere and emailed a code to unlock it themself. */
adminRouter.post('/users/:id/lock', requirePermission(P.USERS_MANAGE), async (req, res) => {
  const user = await getUser(req.params.id);
  assertCanActOn(req, user);
  if (user.locked) throw new HttpError(400, 'This account is already locked', 'ALREADY_LOCKED');
  await lockAccount(user.id, 'admin', { ip: req.ip, by: req.user.email });
  await audit(req, 'user.lock', 'user', user.id, { email: user.email });
  res.json({ user: await getUser(user.id) });
});

adminRouter.post('/users/:id/unlock', requirePermission(P.USERS_MANAGE), async (req, res) => {
  const user = await getUser(req.params.id);
  assertCanActOn(req, user, { allowSelf: true });
  await unlockAccount(user.id, { ip: req.ip, by: req.user.email });
  await audit(req, 'user.unlock', 'user', user.id, { email: user.email });
  res.json({ user: await getUser(user.id) });
});

adminRouter.post('/users/:id/logout', requirePermission(P.USERS_MANAGE), async (req, res) => {
  const user = await getUser(req.params.id);
  assertCanActOn(req, user);
  await query('UPDATE members SET token_version = token_version + 1 WHERE id = $1', [user.id]);
  await audit(req, 'user.logout_all', 'user', user.id, { email: user.email });
  res.json({ ok: true });
});

adminRouter.post('/users/:id/verify-email', requirePermission(P.USERS_MANAGE), async (req, res) => {
  const user = await getUser(req.params.id);
  assertCanActOn(req, user, { allowSelf: true });
  await query('UPDATE members SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [user.id]);
  await audit(req, 'user.verify_email', 'user', user.id, { email: user.email });
  res.json({ user: await getUser(user.id) });
});

adminRouter.delete('/users/:id', requirePermission(P.USERS_DELETE), async (req, res) => {
  const user = await getUser(req.params.id);
  assertCanActOn(req, user);
  await query('DELETE FROM members WHERE id = $1', [user.id]);
  await audit(req, 'user.delete', 'user', user.id, { email: user.email });
  res.status(204).end();
});

/* -------------------------------- Templates -------------------------------- */

const templateSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'Use lowercase letters, numbers and dashes'),
  category: z.enum(CATEGORY_KEYS),
  type: z.enum(['habit', 'trading', 'spending']),
  name: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().max(120).default(''),
  icon: z.string().trim().max(40).default('target'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#7C5CFF'),
  config: z.record(z.string(), z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

function checkTemplateConfig(type, cfg) {
  try {
    parseConfig(type, cfg);
  } catch (err) {
    const i = err.issues?.[0];
    throw new HttpError(400, `config.${i?.path.join('.')}: ${i?.message}`, 'VALIDATION');
  }
}

const TEMPLATE_FIELDS = `id, slug, category, type, name, subtitle, icon, color, config, sort_order AS "sortOrder", active, updated_at AS "updatedAt"`;

adminRouter.get('/templates', requirePermission(P.TEMPLATES_MANAGE), async (_req, res) => {
  const { rows } = await query(`SELECT ${TEMPLATE_FIELDS} FROM templates ORDER BY category, sort_order, name`);
  res.json({ templates: rows });
});

adminRouter.post('/templates', requirePermission(P.TEMPLATES_MANAGE), async (req, res) => {
  const b = parse(templateSchema, req.body);
  checkTemplateConfig(b.type, b.config);
  try {
    const { rows } = await query(
      `INSERT INTO templates (slug, category, type, name, subtitle, icon, color, config, sort_order, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${TEMPLATE_FIELDS}`,
      [b.slug, b.category, b.type, b.name, b.subtitle, b.icon, b.color, JSON.stringify(b.config), b.sortOrder, b.active],
    );
    await audit(req, 'template.create', 'template', rows[0].id, { slug: b.slug });
    res.status(201).json({ template: rows[0] });
  } catch (err) {
    if (err?.code === '23505') throw new HttpError(409, 'A template with this slug already exists', 'SLUG_TAKEN');
    throw err;
  }
});

adminRouter.patch('/templates/:id', requirePermission(P.TEMPLATES_MANAGE), async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Template not found', 'NOT_FOUND');
  const { rows: existing } = await query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
  if (!existing[0]) throw new HttpError(404, 'Template not found', 'NOT_FOUND');
  const b = parse(templateSchema.partial(), req.body);
  const merged = { ...existing[0], ...b };
  checkTemplateConfig(merged.type, b.config ?? existing[0].config);
  const { rows } = await query(
    `UPDATE templates SET slug=$2, category=$3, type=$4, name=$5, subtitle=$6, icon=$7, color=$8, config=$9,
       sort_order=$10, active=$11, updated_at=now() WHERE id=$1 RETURNING ${TEMPLATE_FIELDS}`,
    [req.params.id, merged.slug, merged.category, merged.type, merged.name, merged.subtitle, merged.icon, merged.color,
     JSON.stringify(b.config ?? existing[0].config), b.sortOrder ?? existing[0].sort_order, merged.active],
  );
  await audit(req, 'template.update', 'template', req.params.id, { slug: merged.slug, fields: Object.keys(b) });
  res.json({ template: rows[0] });
});

adminRouter.delete('/templates/:id', requirePermission(P.TEMPLATES_MANAGE), async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Template not found', 'NOT_FOUND');
  const { rows } = await query('DELETE FROM templates WHERE id = $1 RETURNING slug', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Template not found', 'NOT_FOUND');
  await audit(req, 'template.delete', 'template', req.params.id, { slug: rows[0].slug });
  res.status(204).end();
});

/* ------------------------------- Starter packs ------------------------------- */

const packSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'Use lowercase letters, numbers and dashes'),
  name: z.string().trim().min(1).max(60),
  emoji: z.string().trim().min(1).max(8).default('✨'),
  description: z.string().trim().max(200).default(''),
  templateSlugs: z.array(z.string().trim().min(1).max(60)).min(1, 'Pick at least one template').max(10),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

/** Every template slug in a pack must exist. */
async function assertTemplatesExist(slugs) {
  const { rows } = await query('SELECT slug FROM templates WHERE slug = ANY($1::text[])', [slugs]);
  const missing = slugs.filter((s) => !rows.some((r) => r.slug === s));
  if (missing.length) throw new HttpError(400, `Unknown template: ${missing.join(', ')}`, 'VALIDATION');
}

adminRouter.get('/starter-packs', requirePermission(P.TEMPLATES_MANAGE), async (_req, res) => {
  const [{ rows: packs }, { rows: used }] = await Promise.all([
    query(`SELECT ${PACK_FIELDS} FROM starter_packs ORDER BY sort_order, name`),
    // How often each template was created — a rough "how popular is this pack" signal
    query(`SELECT template_slug AS slug, count(*)::int AS n FROM trackers WHERE template_slug IS NOT NULL GROUP BY 1`),
  ]);
  const usage = Object.fromEntries(used.map((r) => [r.slug, r.n]));
  res.json({ packs: packs.map((p) => ({ ...p, builtIn: isDefaultPack(p.slug) })), usage });
});

adminRouter.post('/starter-packs', requirePermission(P.TEMPLATES_MANAGE), async (req, res) => {
  const body = parse(packSchema, req.body);
  await assertTemplatesExist(body.templateSlugs);
  try {
    const { rows } = await query(
      `INSERT INTO starter_packs (slug, name, emoji, description, template_slugs, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${PACK_FIELDS}`,
      [body.slug, body.name, body.emoji, body.description, body.templateSlugs, body.sortOrder, body.active],
    );
    await audit(req, 'pack.create', 'starter_pack', rows[0].id, { slug: body.slug });
    res.status(201).json({ pack: rows[0] });
  } catch (err) {
    if (err?.code === '23505') throw new HttpError(409, 'A pack with this slug already exists', 'DUPLICATE');
    throw err;
  }
});

adminRouter.patch('/starter-packs/:id', requirePermission(P.TEMPLATES_MANAGE), async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Pack not found', 'NOT_FOUND');
  const body = parse(packSchema.partial().omit({ slug: true }), req.body);
  if (body.templateSlugs) await assertTemplatesExist(body.templateSlugs);
  const { rows } = await query(
    `UPDATE starter_packs SET name = COALESCE($2, name), emoji = COALESCE($3, emoji), description = COALESCE($4, description),
       template_slugs = COALESCE($5, template_slugs), sort_order = COALESCE($6, sort_order), active = COALESCE($7, active), updated_at = now()
     WHERE id = $1 RETURNING ${PACK_FIELDS}`,
    [req.params.id, body.name ?? null, body.emoji ?? null, body.description ?? null, body.templateSlugs ?? null, body.sortOrder ?? null, body.active ?? null],
  );
  if (!rows[0]) throw new HttpError(404, 'Pack not found', 'NOT_FOUND');
  await audit(req, 'pack.update', 'starter_pack', rows[0].id, { slug: rows[0].slug, ...body });
  res.json({ pack: rows[0] });
});

adminRouter.delete('/starter-packs/:id', requirePermission(P.TEMPLATES_MANAGE), async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Pack not found', 'NOT_FOUND');
  const { rows } = await query('SELECT slug FROM starter_packs WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Pack not found', 'NOT_FOUND');
  // Built-in packs would be re-created on the next start, so they are hidden instead of deleted
  if (isDefaultPack(rows[0].slug)) await query('UPDATE starter_packs SET active = false, updated_at = now() WHERE id = $1', [req.params.id]);
  else await query('DELETE FROM starter_packs WHERE id = $1', [req.params.id]);
  await audit(req, 'pack.delete', 'starter_pack', req.params.id, { slug: rows[0].slug });
  res.status(204).end();
});

/* -------------------------------- Audit log -------------------------------- */

adminRouter.get('/audit-logs', requirePermission(P.AUDIT_VIEW), async (req, res) => {
  const p = listParams({ limit: 50, ...req.query });
  // Search who did it, what they did, or what it was done to
  const where = p.like ? `WHERE actor_email ILIKE $1 OR action ILIKE $1 OR target_type ILIKE $1 OR target_id ILIKE $1 OR meta::text ILIKE $1` : '';
  const params = p.like ? [p.like] : [];
  const [{ rows }, { rows: total }] = await Promise.all([
    query(
      `SELECT id, actor_email AS "actorEmail", action, target_type AS "targetType", target_id AS "targetId", meta, created_at AS "createdAt"
         FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ${p.limit} OFFSET ${p.offset}`,
      params,
    ),
    query(`SELECT count(*)::int AS n FROM audit_logs ${where}`, params),
  ]);
  res.json({ logs: rows, ...pageInfo(total[0].n, p) });
});
