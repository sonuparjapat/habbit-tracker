/**
 * Trackers: create / edit / delete them, daily check-ins and journals, and stats.
 * Trades and expenses have their own files: trackerTrades.js and trackerExpenses.js.
 *
 *   GET    /api/trackers                     my trackers (?archived=true for archived ones)
 *   POST   /api/trackers                     create a tracker
 *   POST   /api/trackers/from-pack           create every tracker in a starter pack { slug }
 *   GET    /api/trackers/:id                 one tracker
 *   PATCH  /api/trackers/:id                 rename, recolour, archive, reorder, change settings
 *   DELETE /api/trackers/:id                 delete a tracker and everything in it
 *   GET    /api/trackers/:id/entries         daily check-ins / journals in a date range
 *   PUT    /api/trackers/:id/entries/:date   check in (or write the journal) for a day
 *   DELETE /api/trackers/:id/entries/:date   undo a check-in
 *   GET    /api/trackers/:id/today           today's card (streak, progress, alerts)
 *   GET    /api/trackers/:id/stats           report for a period (week / month / year / custom)
 *   GET    /api/trackers/:id/rule-breaks     every rule broken in a date range
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { HttpError, parse } from '../middleware/errors.js';
import { CATEGORY_KEYS } from '../services/catalog.js';
import { deleteEntry, upsertEntry } from '../services/entries.js';
import { computeHabitStats, shieldRules } from '../services/habitStats.js';
import { ruleLabel } from '../services/rules.js';
import { getSettings } from '../services/settings.js';
import { applyPack } from '../services/starterPacks.js';
import { computeSpendingStats } from '../services/spendingStats.js';
import { parseConfig } from '../services/trackerConfig.js';
import {
  createdDate,
  getTracker,
  loadBreaks,
  loadExpenses,
  loadTrades,
  serializeTracker,
  todayFor,
  trackingStart,
} from '../services/trackers.js';
import { computeTradingStats } from '../services/tradingStats.js';
import { resolveRange, todayIn } from '../utils/date.js';
import { hexColor } from '../utils/validation.js';

export const trackersRouter = Router();

/** Check a tracker's settings; turn a validation problem into a readable 400 error. */
function validateConfig(type, raw) {
  try {
    return parseConfig(type, raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      throw new HttpError(400, `${issue?.path.join('.') || 'config'}: ${issue?.message}`, 'VALIDATION');
    }
    throw err;
  }
}

/** Icon and colour used when the member doesn't pick one. */
const DEFAULT_LOOK = {
  habit: { icon: 'target', color: '#7C5CFF' },
  trading: { icon: 'chart-line', color: '#22C55E' },
  spending: { icon: 'wallet-outline', color: '#14B8A6' },
};

/* ----------------------------- Tracker CRUD ----------------------------- */

const createSchema = z.object({
  type: z.enum(['habit', 'trading', 'spending']),
  category: z.enum(CATEGORY_KEYS).default('other'),
  name: z.string().trim().min(1, 'Give your tracker a name').max(60),
  icon: z.string().max(40).optional(),
  color: hexColor.optional(),
  templateSlug: z.string().max(60).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

/** GET /api/trackers — my trackers, in my order. */
trackersRouter.get('/', async (req, res) => {
  const archived = req.query.archived === 'true';
  const { rows } = await query(
    `SELECT * FROM trackers WHERE user_id = $1 AND archived = $2 ORDER BY sort_order, created_at`,
    [req.user.id, archived],
  );
  res.json({ trackers: rows.map(serializeTracker) });
});

/** POST /api/trackers — create a tracker (respects the admin's limit and feature switches). */
trackersRouter.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);
  const cfg = validateConfig(body.type, body.config);

  const [{ rows: countRows }, settings] = await Promise.all([
    query('SELECT count(*) AS n FROM trackers WHERE user_id = $1', [req.user.id]),
    getSettings(),
  ]);
  const max = settings.max_trackers_per_member;
  if (countRows[0].n >= max) throw new HttpError(400, `You can have up to ${max} trackers. Archive or delete one to add another.`, 'LIMIT');

  const featureOff = (body.type === 'trading' && !settings.feature_trading) || (body.type === 'spending' && !settings.feature_spending);
  if (featureOff) throw new HttpError(400, 'This kind of tracker is not available right now', 'FEATURE_OFF');

  const look = DEFAULT_LOOK[body.type];
  const { rows } = await query(
    `INSERT INTO trackers (user_id, type, category, name, icon, color, config, template_slug, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM trackers WHERE user_id = $1))
     RETURNING *`,
    [req.user.id, body.type, body.category, body.name, body.icon ?? look.icon, body.color ?? look.color, JSON.stringify(cfg), body.templateSlug ?? null],
  );
  res.status(201).json({ tracker: serializeTracker(rows[0]) });
});

/** POST /api/trackers/from-pack — one tap, several trackers (skips ones the member already has). */
trackersRouter.post('/from-pack', async (req, res) => {
  const { slug } = parse(z.object({ slug: z.string().trim().min(1).max(60) }), req.body);
  const { created, skipped } = await applyPack(req.user.id, slug);
  res.status(201).json({ trackers: created.map(serializeTracker), skipped });
});

/** GET /api/trackers/:id — one tracker. */
trackersRouter.get('/:id', async (req, res) => {
  res.json({ tracker: serializeTracker(await getTracker(req.user.id, req.params.id)) });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  category: z.enum(CATEGORY_KEYS).optional(),
  icon: z.string().max(40).optional(),
  color: hexColor.optional(),
  archived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

/** PATCH /api/trackers/:id — change only the fields that were sent (COALESCE keeps the rest). */
trackersRouter.patch('/:id', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  const body = parse(updateSchema, req.body);
  // New settings are merged over the old ones, then checked as a whole
  const cfg = body.config ? validateConfig(t.type, { ...t.config, ...body.config }) : null;
  const { rows } = await query(
    `UPDATE trackers SET
       name = COALESCE($2, name), icon = COALESCE($3, icon), color = COALESCE($4, color),
       archived = COALESCE($5, archived), sort_order = COALESCE($6, sort_order),
       config = COALESCE($7, config), category = COALESCE($8, category), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      t.id,
      body.name ?? null,
      body.icon ?? null,
      body.color ?? null,
      body.archived ?? null,
      body.sortOrder ?? null,
      cfg ? JSON.stringify(cfg) : null,
      body.category ?? null,
    ],
  );
  res.json({ tracker: serializeTracker(rows[0]) });
});

/** DELETE /api/trackers/:id — the database deletes its entries, trades, expenses and breaks too (ON DELETE CASCADE). */
trackersRouter.delete('/:id', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  await query('DELETE FROM trackers WHERE id = $1', [t.id]);
  res.status(204).end();
});

/* ------------------------- Daily entries / journal ------------------------ */

/** GET /api/trackers/:id/entries?from=&to= */
trackersRouter.get('/:id/entries', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  const range = resolveRange(todayIn(req.user.timezone), req.query);
  const { rows } = await query(
    `SELECT entry_date AS date, value, completed, mood, note, reflection
       FROM daily_entries WHERE tracker_id = $1 AND entry_date BETWEEN $2 AND $3 ORDER BY entry_date`,
    [t.id, range.from, range.to],
  );
  res.json({ range, entries: rows });
});

/**
 * PUT /api/trackers/:id/entries/:date — check in for a day (create or update).
 * Only the fields sent are changed; the rest keep their saved value. (Logic: services/entries.js)
 */
trackersRouter.put('/:id/entries/:date', async (req, res) => {
  res.json({ entry: await upsertEntry(req.user, req.params.id, req.params.date, req.body) });
});

/** DELETE /api/trackers/:id/entries/:date — undo a check-in for a day. */
trackersRouter.delete('/:id/entries/:date', async (req, res) => {
  await deleteEntry(req.user, req.params.id, req.params.date);
  res.status(204).end();
});

/* -------------------------------- Stats -------------------------------- */

/** GET /api/trackers/:id/today — the same card the Today screen shows. */
trackersRouter.get('/:id/today', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  res.json(await todayFor(t, req.user));
});

/** GET /api/trackers/:id/stats?period= — the report. Each tracker type has its own calculator in services/. */
trackersRouter.get('/:id/stats', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  const today = todayIn(req.user.timezone);
  const range = resolveRange(today, req.query);
  const cfg = parseConfig(t.type, t.config);

  if (t.type === 'trading') {
    const [trades, breaks] = await Promise.all([loadTrades(t.id, range.from, range.to), loadBreaks(t.id, range.from, range.to)]);
    res.json(computeTradingStats(cfg, req.user.currency, range, trades, breaks));
    return;
  }

  if (t.type === 'spending') {
    // Don't count days before the tracker existed as "under budget"
    const start = createdDate(t, req.user.timezone);
    const r = { from: range.from < start ? start : range.from, to: range.to };
    const [expenses, breaks] = await Promise.all([loadExpenses(t.id, r.from, r.to), loadBreaks(t.id, r.from, r.to)]);
    res.json(computeSpendingStats(cfg, req.user.currency, r, today, expenses, breaks));
    return;
  }

  // Habit
  const [{ rows: entries }, { rows: done }] = await Promise.all([
    query(`SELECT entry_date, value, completed, mood, note FROM daily_entries WHERE tracker_id = $1 AND entry_date BETWEEN $2 AND $3`, [
      t.id,
      range.from,
      range.to,
    ]),
    query('SELECT entry_date FROM daily_entries WHERE tracker_id = $1 AND completed', [t.id]),
  ]);
  const doneDates = done.map((d) => d.entry_date);
  const settings = await getSettings();
  res.json(computeHabitStats(cfg, range, trackingStart(t, req.user.timezone, doneDates), today, entries, new Set(doneDates), shieldRules(settings)));
});

/** GET /api/trackers/:id/rule-breaks?from=&to= — every rule broken, newest first, with the amount involved. */
trackersRouter.get('/:id/rule-breaks', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  const range = resolveRange(todayIn(req.user.timezone), req.query);
  const { rows } = await query(
    `SELECT rb.id, rb.break_date AS date, rb.rule, rb.description, rb.reason,
            rb.trade_id AS "tradeId", rb.expense_id AS "expenseId",
            COALESCE(tr.pnl - tr.fees, -ex.amount) AS amount
       FROM rule_breaks rb
       LEFT JOIN trades tr ON tr.id = rb.trade_id
       LEFT JOIN expenses ex ON ex.id = rb.expense_id
      WHERE rb.tracker_id = $1 AND rb.break_date BETWEEN $2 AND $3
      ORDER BY rb.break_date DESC, rb.created_at DESC LIMIT 500`,
    [t.id, range.from, range.to],
  );
  res.json({ range, breaks: rows.map((r) => ({ ...r, label: ruleLabel(r.rule) })) });
});
