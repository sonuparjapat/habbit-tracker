/**
 * Admin: settings, announcements, feedback inbox, system health and analytics.
 * Mounted under /api/admin (requireAuth + requireAdmin already applied); each route checks its permission.
 *
 *   GET    /api/admin/settings               every setting with its value (form is built from this)
 *   PUT    /api/admin/settings               save changed settings
 *   DELETE /api/admin/settings/:key          reset one setting to its default
 *   GET    /api/admin/announcements          banners shown in the app
 *   POST   /api/admin/announcements          add one
 *   PATCH  /api/admin/announcements/:id      edit / activate / deactivate
 *   DELETE /api/admin/announcements/:id      delete
 *   GET    /api/admin/feedback               feedback inbox (?status=new)
 *   PATCH  /api/admin/feedback/:id           change status, add a note
 *   DELETE /api/admin/feedback/:id           delete
 *   GET    /api/admin/analytics              growth, retention, popular trackers, rules broken most
 *   GET    /api/admin/system                 API / database / migrations / email health
 *   POST   /api/admin/system/test-email      send a test email
 */
import { Router } from 'express';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, query } from '../db/pool.js';
import { requirePermission } from '../middleware/auth.js';
import { HttpError, isUuid, parse } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { sendEmail } from '../services/email.js';
import { PERMISSIONS as P } from '../services/roles.js';
import { ruleLabel } from '../services/rules.js';
import { getSettings, resetSetting, saveSettings, SETTINGS } from '../services/settings.js';

export const adminContentRouter = Router();

const zodMessage = (err) => {
  const i = err?.issues?.[0];
  return i ? `${i.path.join('.') || 'value'}: ${i.message}` : err?.message;
};

/* -------------------------------- Settings -------------------------------- */

adminContentRouter.get('/settings', requirePermission(P.SETTINGS_MANAGE), async (_req, res) => {
  const [values, { rows }] = await Promise.all([
    getSettings(),
    query(`SELECT s.key, s.updated_at AS "updatedAt", m.email AS "updatedBy" FROM app_settings s LEFT JOIN members m ON m.id = s.updated_by`),
  ]);
  const meta = new Map(rows.map((r) => [r.key, r]));
  res.json({
    settings: Object.entries(SETTINGS).map(([key, def]) => ({
      key,
      ...def,
      value: values[key],
      customised: meta.has(key),
      updatedAt: meta.get(key)?.updatedAt ?? null,
      updatedBy: meta.get(key)?.updatedBy ?? null,
    })),
  });
});

adminContentRouter.put('/settings', requirePermission(P.SETTINGS_MANAGE), async (req, res) => {
  const values = parse(z.record(z.string(), z.unknown()), req.body?.values ?? {});
  for (const key of Object.keys(values)) if (!SETTINGS[key]) throw new HttpError(400, `Unknown setting: ${key}`, 'VALIDATION');
  let changed;
  try {
    changed = await saveSettings(values, req.user.id);
  } catch (err) {
    throw new HttpError(400, zodMessage(err), 'VALIDATION');
  }
  if (changed.length) await audit(req, 'settings.update', 'settings', null, { keys: changed });
  res.json({ ok: true, changed });
});

adminContentRouter.delete('/settings/:key', requirePermission(P.SETTINGS_MANAGE), async (req, res) => {
  if (!SETTINGS[req.params.key]) throw new HttpError(404, 'Unknown setting', 'NOT_FOUND');
  await resetSetting(req.params.key);
  await audit(req, 'settings.reset', 'settings', req.params.key);
  res.status(204).end();
});

/* ------------------------------ Announcements ------------------------------ */

const announcementSchema = z
  .object({
    title: z.string().trim().min(1, 'Add a title').max(120),
    body: z.string().trim().max(1000).default(''),
    level: z.enum(['info', 'success', 'warning', 'danger']).default('info'),
    ctaLabel: z.string().trim().max(40).nullable().optional(),
    ctaUrl: z.union([z.literal(''), z.url('Enter a full URL')]).nullable().optional(),
    startsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    active: z.boolean().default(true),
  })
  .refine((a) => !a.startsAt || !a.endsAt || a.startsAt < a.endsAt, { message: 'End must be after start', path: ['endsAt'] });

const ANN_FIELDS = `id, title, body, level, cta_label AS "ctaLabel", cta_url AS "ctaUrl", starts_at AS "startsAt", ends_at AS "endsAt",
  active, created_at AS "createdAt", updated_at AS "updatedAt",
  (active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())) AS live`;

adminContentRouter.get('/announcements', requirePermission(P.CONTENT_MANAGE), async (_req, res) => {
  const { rows } = await query(`SELECT ${ANN_FIELDS} FROM announcements ORDER BY created_at DESC LIMIT 200`);
  res.json({ announcements: rows });
});

adminContentRouter.post('/announcements', requirePermission(P.CONTENT_MANAGE), async (req, res) => {
  const a = parse(announcementSchema, req.body);
  const { rows } = await query(
    `INSERT INTO announcements (title, body, level, cta_label, cta_url, starts_at, ends_at, active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${ANN_FIELDS}`,
    [a.title, a.body, a.level, a.ctaLabel || null, a.ctaUrl || null, a.startsAt ?? null, a.endsAt ?? null, a.active, req.user.id],
  );
  await audit(req, 'announcement.create', 'announcement', rows[0].id, { title: a.title });
  res.status(201).json({ announcement: rows[0] });
});

adminContentRouter.patch('/announcements/:id', requirePermission(P.CONTENT_MANAGE), async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Announcement not found', 'NOT_FOUND');
  const { rows: cur } = await query('SELECT * FROM announcements WHERE id = $1', [req.params.id]);
  if (!cur[0]) throw new HttpError(404, 'Announcement not found', 'NOT_FOUND');
  const c = cur[0];
  const merged = parse(announcementSchema, {
    title: c.title,
    body: c.body,
    level: c.level,
    ctaLabel: c.cta_label,
    ctaUrl: c.cta_url,
    startsAt: c.starts_at?.toISOString() ?? null,
    endsAt: c.ends_at?.toISOString() ?? null,
    active: c.active,
    ...req.body,
  });
  const { rows } = await query(
    `UPDATE announcements SET title=$2, body=$3, level=$4, cta_label=$5, cta_url=$6, starts_at=$7, ends_at=$8, active=$9, updated_at=now()
      WHERE id=$1 RETURNING ${ANN_FIELDS}`,
    [c.id, merged.title, merged.body, merged.level, merged.ctaLabel || null, merged.ctaUrl || null, merged.startsAt ?? null, merged.endsAt ?? null, merged.active],
  );
  await audit(req, 'announcement.update', 'announcement', c.id, { title: merged.title, fields: Object.keys(req.body ?? {}) });
  res.json({ announcement: rows[0] });
});

adminContentRouter.delete('/announcements/:id', requirePermission(P.CONTENT_MANAGE), async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Announcement not found', 'NOT_FOUND');
  const { rows } = await query('DELETE FROM announcements WHERE id = $1 RETURNING title', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Announcement not found', 'NOT_FOUND');
  await audit(req, 'announcement.delete', 'announcement', req.params.id, { title: rows[0].title });
  res.status(204).end();
});

/* -------------------------------- Feedback -------------------------------- */

adminContentRouter.get('/feedback', requirePermission(P.FEEDBACK_MANAGE), async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(['new', 'in_progress', 'resolved']).optional(),
      kind: z.enum(['bug', 'idea', 'question', 'other', 'crash']).optional(),
      page: z.coerce.number().int().min(1).default(1),
    }),
    req.query,
  );
  const where = [];
  const params = [];
  if (q.status) where.push(`f.status = $${params.push(q.status)}`);
  if (q.kind) where.push(`f.kind = $${params.push(q.kind)}`);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ rows }, { rows: counts }] = await Promise.all([
    query(
      `SELECT f.id, f.kind, f.message, f.email, f.status, f.admin_note AS "adminNote", f.app_version AS "appVersion",
              f.platform, f.created_at AS "createdAt", f.updated_at AS "updatedAt", f.user_id AS "userId", m.name AS "userName"
         FROM feedback f LEFT JOIN members m ON m.id = f.user_id ${w}
        ORDER BY f.created_at DESC LIMIT 50 OFFSET ${(q.page - 1) * 50}`,
      params,
    ),
    query(`SELECT status, count(*) AS n FROM feedback GROUP BY status`),
  ]);
  res.json({ feedback: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), page: q.page });
});

adminContentRouter.patch('/feedback/:id', requirePermission(P.FEEDBACK_MANAGE), async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Feedback not found', 'NOT_FOUND');
  const b = parse(z.object({ status: z.enum(['new', 'in_progress', 'resolved']).optional(), adminNote: z.string().max(2000).nullable().optional() }), req.body);
  const { rows } = await query(
    `UPDATE feedback SET status = COALESCE($2, status), admin_note = CASE WHEN $3::boolean THEN $4 ELSE admin_note END, updated_at = now()
      WHERE id = $1 RETURNING id, status, admin_note AS "adminNote"`,
    [req.params.id, b.status ?? null, b.adminNote !== undefined, b.adminNote ?? null],
  );
  if (!rows[0]) throw new HttpError(404, 'Feedback not found', 'NOT_FOUND');
  await audit(req, 'feedback.update', 'feedback', req.params.id, b);
  res.json({ feedback: rows[0] });
});

adminContentRouter.delete('/feedback/:id', requirePermission(P.FEEDBACK_MANAGE), async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Feedback not found', 'NOT_FOUND');
  const { rowCount } = await query('DELETE FROM feedback WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Feedback not found', 'NOT_FOUND');
  await audit(req, 'feedback.delete', 'feedback', req.params.id);
  res.status(204).end();
});

/* -------------------------------- Analytics -------------------------------- */

adminContentRouter.get('/analytics', requirePermission(P.DASHBOARD_VIEW), async (_req, res) => {
  const [active, templates, feedback, achievements, retention, breaks] = await Promise.all([
    // Members who logged anything, per day, last 30 days
    query(`SELECT to_char(d, 'YYYY-MM-DD') AS date,
                  (SELECT count(DISTINCT user_id) FROM (
                     SELECT user_id FROM daily_entries WHERE updated_at::date = d::date
                     UNION ALL SELECT user_id FROM trades WHERE created_at::date = d::date
                     UNION ALL SELECT user_id FROM expenses WHERE created_at::date = d::date) x) AS n
             FROM generate_series(current_date - 29, current_date, interval '1 day') d ORDER BY d`),
    query(`SELECT COALESCE(t.template_slug, 'custom') AS slug, COALESCE(tp.name, 'Custom tracker') AS name, count(*) AS n
             FROM trackers t LEFT JOIN templates tp ON tp.slug = t.template_slug
            GROUP BY 1, 2 ORDER BY n DESC LIMIT 10`),
    query(`SELECT count(*) FILTER (WHERE status = 'new') AS new, count(*) AS total FROM feedback`),
    query(`SELECT achievement, count(*) AS n FROM member_achievements GROUP BY achievement ORDER BY n DESC`),
    // Of members who joined 8–37 days ago, how many were active in the last 7 days
    query(`SELECT count(*) AS cohort, count(*) FILTER (WHERE last_active_at > now() - interval '7 days') AS retained
             FROM members WHERE role = 3 AND created_at BETWEEN now() - interval '37 days' AND now() - interval '8 days'`),
    // Which rules members break most (last 30 days) — shows where people struggle
    query(`SELECT rule, count(*) AS n FROM rule_breaks WHERE break_date > current_date - 30 GROUP BY rule ORDER BY n DESC LIMIT 12`),
  ]);
  const r = retention.rows[0];
  res.json({
    activeSeries: active.rows,
    topTemplates: templates.rows,
    feedback: feedback.rows[0],
    achievements: achievements.rows,
    ruleBreaks: breaks.rows.map((b) => ({ rule: b.rule, label: ruleLabel(b.rule), n: b.n })),
    retention: { cohort: r.cohort, retained: r.retained, rate: r.cohort ? Math.round((r.retained / r.cohort) * 100) : null },
  });
});

/* --------------------------------- System --------------------------------- */

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');

adminContentRouter.get('/system', requirePermission(P.SYSTEM_VIEW), async (_req, res) => {
  const started = Date.now();
  const [{ rows: dbInfo }, { rows: applied }, files, { rows: tables }] = await Promise.all([
    query(`SELECT version() AS version, pg_size_pretty(pg_database_size(current_database())) AS size`),
    query(`SELECT name, applied_at AS "appliedAt" FROM schema_migrations ORDER BY name`),
    readdir(migrationsDir),
    query(`SELECT relname AS name, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY relname`),
  ]);
  const appliedSet = new Set(applied.map((m) => m.name));
  res.json({
    api: { appName: config.appName, node: process.version, uptimeSeconds: Math.round(process.uptime()), env: config.isProd ? 'production' : 'development' },
    database: {
      ok: true,
      latencyMs: Date.now() - started,
      version: String(dbInfo[0].version).split(' ').slice(0, 2).join(' '),
      size: dbInfo[0].size,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      tables,
    },
    migrations: { applied, pending: files.filter((f) => f.endsWith('.sql') && !appliedSet.has(f)) },
    email: { provider: config.email.provider, from: `${config.email.from.name} <${config.email.from.email}>`, problem: config.email.problem },
  });
});

adminContentRouter.post('/system/test-email', requirePermission(P.SYSTEM_VIEW), async (req, res) => {
  const { to } = parse(z.object({ to: z.string().trim().pipe(z.email('Enter a valid email')) }), req.body);
  if (config.email.problem) throw new HttpError(503, config.email.problem, 'EMAIL_NOT_CONFIGURED');
  try {
    await sendEmail({
      to,
      subject: `${config.appName} test email`,
      text: `This is a test email from the ${config.appName} admin panel. Email is working.`,
      html: `<p>This is a test email from the <b>${config.appName}</b> admin panel.</p><p>Email is working ✅</p>`,
    });
  } catch (err) {
    throw new HttpError(502, `Email failed: ${err.message}`, 'EMAIL_FAILED');
  }
  await audit(req, 'system.test_email', 'email', to);
  res.json({ ok: true, provider: config.email.provider });
});
