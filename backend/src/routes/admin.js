/**
 * Admin API — for super admins (role 1) and admins (role 2), gated per route by permissions
 * (see src/services/roles.js). Privacy rule: staff see accounts and aggregate counts,
 * never the content of a user's trades, journals or expenses.
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requirePermission, USER_FIELDS } from '../middleware/auth.js';
import { HttpError, isUuid, parse } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { CATEGORY_KEYS } from '../services/catalog.js';
import { can, PERMISSIONS, ROLE_NAMES, ROLES } from '../services/roles.js';
import { parseConfig } from '../services/trackerConfig.js';

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
  const { rows } = await query(`SELECT ${USER_FIELDS}, last_active_at AS "lastActiveAt" FROM members WHERE id = $1`, [id]);
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
  const body = parse(z.object({ status: z.enum(['active', 'suspended']).optional(), role: z.union([z.literal(ROLES.ADMIN), z.literal(ROLES.USER)]).optional() }), req.body);
  assertCanActOn(req, user);
  if (body.role !== undefined && body.role !== user.role && !can(req.user.role, P.ADMINS_MANAGE))
    throw new HttpError(403, 'Only a super admin can change roles', 'FORBIDDEN');
  await query(
    `UPDATE members SET status = COALESCE($2, status), role = COALESCE($3, role), updated_at = now(),
       token_version = token_version + CASE WHEN $2 = 'suspended' THEN 1 ELSE 0 END
     WHERE id = $1`,
    [user.id, body.status ?? null, body.role ?? null],
  );
  await audit(req, 'user.update', 'user', user.id, { email: user.email, ...body, ...(body.role ? { role: ROLE_NAMES[body.role] } : {}) });
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

/* -------------------------------- Audit log -------------------------------- */

adminRouter.get('/audit-logs', requirePermission(P.AUDIT_VIEW), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const { rows } = await query(
    `SELECT id, actor_email AS "actorEmail", action, target_type AS "targetType", target_id AS "targetId", meta, created_at AS "createdAt"
       FROM audit_logs ORDER BY created_at DESC LIMIT 50 OFFSET $1`,
    [(page - 1) * 50],
  );
  res.json({ logs: rows, page });
});
