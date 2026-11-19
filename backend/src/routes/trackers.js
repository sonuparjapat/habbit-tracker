import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { HttpError, parse } from '../middleware/errors.js';
import { CATEGORY_KEYS } from '../services/catalog.js';
import { getSettings } from '../services/settings.js';
import { computeHabitStats, isComplete } from '../services/habitStats.js';
import {
  computeDayStatus,
  reevaluateSpendingMonth,
  reevaluateTradingDay,
  RULE_LABELS,
} from '../services/rules.js';
import { computeSpendingStats } from '../services/spendingStats.js';
import { EMOTIONS, parseConfig } from '../services/trackerConfig.js';
import {
  createdDate,
  dayStatusFor,
  getTracker,
  trackingStart,
  loadBreaks,
  loadExpenses,
  loadTrades,
  requireType,
  serializeTracker,
  todayFor,
} from '../services/trackers.js';
import { computeTradingStats } from '../services/tradingStats.js';
import { DATE_RE, resolveRange, todayIn, weekdayOf } from '../utils/date.js';

export const trackersRouter = Router();

const dateStr = z.string().regex(DATE_RE, 'Use YYYY-MM-DD');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #7C5CFF');

function validateConfig(type, raw) {
  try {
    return parseConfig(type, raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const i = err.issues[0];
      throw new HttpError(400, `${i?.path.join('.') || 'config'}: ${i?.message}`, 'VALIDATION');
    }
    throw err;
  }
}

/* ----------------------------- Tracker CRUD ----------------------------- */

const createSchema = z.object({
  type: z.enum(['habit', 'trading', 'spending']),
  category: z.enum(CATEGORY_KEYS).default('other'),
  name: z.string().trim().min(1, 'Give your tracker a name').max(60),
  icon: z.string().max(40).optional(),
  color: color.optional(),
  templateSlug: z.string().max(60).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

trackersRouter.get('/', async (req, res) => {
  const archived = req.query.archived === 'true';
  const { rows } = await query(
    `SELECT * FROM trackers WHERE user_id = $1 AND archived = $2 ORDER BY sort_order, created_at`,
    [req.user.id, archived],
  );
  res.json({ trackers: rows.map(serializeTracker) });
});

trackersRouter.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);
  const cfg = validateConfig(body.type, body.config);
  const [{ rows: count }, settings] = await Promise.all([query('SELECT count(*) AS n FROM trackers WHERE user_id = $1', [req.user.id]), getSettings()]);
  const max = settings.max_trackers_per_member;
  if (count[0].n >= max) throw new HttpError(400, `You can have up to ${max} trackers. Archive or delete one to add another.`, 'LIMIT');
  if ((body.type === 'trading' && !settings.feature_trading) || (body.type === 'spending' && !settings.feature_spending))
    throw new HttpError(400, 'This kind of tracker is not available right now', 'FEATURE_OFF');
  const defaults = { habit: ['target', '#7C5CFF'], trading: ['chart-line', '#22C55E'], spending: ['wallet-outline', '#14B8A6'] }[body.type];
  const { rows } = await query(
    `INSERT INTO trackers (user_id, type, category, name, icon, color, config, template_slug, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM trackers WHERE user_id = $1))
     RETURNING *`,
    [req.user.id, body.type, body.category, body.name, body.icon ?? defaults[0], body.color ?? defaults[1], JSON.stringify(cfg), body.templateSlug ?? null],
  );
  res.status(201).json({ tracker: serializeTracker(rows[0]) });
});

trackersRouter.get('/:id', async (req, res) => {
  res.json({ tracker: serializeTracker(await getTracker(req.user.id, req.params.id)) });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  category: z.enum(CATEGORY_KEYS).optional(),
  icon: z.string().max(40).optional(),
  color: color.optional(),
  archived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

trackersRouter.patch('/:id', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  const body = parse(updateSchema, req.body);
  const cfg = body.config ? validateConfig(t.type, { ...t.config, ...body.config }) : null;
  const { rows } = await query(
    `UPDATE trackers SET
       name = COALESCE($2, name), icon = COALESCE($3, icon), color = COALESCE($4, color),
       archived = COALESCE($5, archived), sort_order = COALESCE($6, sort_order),
       config = COALESCE($7, config), category = COALESCE($8, category), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [t.id, body.name ?? null, body.icon ?? null, body.color ?? null, body.archived ?? null, body.sortOrder ?? null, cfg ? JSON.stringify(cfg) : null, body.category ?? null],
  );
  res.json({ tracker: serializeTracker(rows[0]) });
});

trackersRouter.delete('/:id', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  await query('DELETE FROM trackers WHERE id = $1', [t.id]);
  res.status(204).end();
});

/* ------------------------- Daily entries / journal ------------------------ */

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

const entrySchema = z.object({
  value: z.number().min(0).max(1e7).optional(),
  completed: z.boolean().optional(),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
  reflection: z
    .object({
      wentWell: z.string().max(2000).optional(),
      mistakes: z.string().max(2000).optional(),
      lesson: z.string().max(2000).optional(),
      followedPlan: z.boolean().optional(),
      marketView: z.string().max(2000).optional(),
    })
    .optional(),
});

trackersRouter.put('/:id/entries/:date', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  const date = parse(dateStr, req.params.date);
  if (date > todayIn(req.user.timezone)) throw new HttpError(400, 'Cannot log a future day', 'FUTURE_DATE');
  const body = parse(entrySchema, req.body);

  const { rows: existingRows } = await query(
    'SELECT value, completed, mood, note, reflection FROM daily_entries WHERE tracker_id = $1 AND entry_date = $2',
    [t.id, date],
  );
  const existing = existingRows[0] ?? { value: 0, completed: false, mood: null, note: null, reflection: {} };
  const value = body.value ?? existing.value;
  const reflection = body.reflection ? { ...existing.reflection, ...body.reflection } : existing.reflection;
  let completed = body.completed ?? existing.completed;
  if (t.type === 'habit') completed = isComplete(parseConfig('habit', t.config), value, completed, true);
  else completed = Boolean(reflection.wentWell || reflection.mistakes || reflection.lesson || body.completed);

  const { rows } = await query(
    `INSERT INTO daily_entries (tracker_id, user_id, entry_date, value, completed, mood, note, reflection)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tracker_id, entry_date) DO UPDATE SET
       value = EXCLUDED.value, completed = EXCLUDED.completed, mood = EXCLUDED.mood,
       note = EXCLUDED.note, reflection = EXCLUDED.reflection, updated_at = now()
     RETURNING entry_date AS date, value, completed, mood, note, reflection`,
    [t.id, req.user.id, date, value, completed, body.mood === undefined ? existing.mood : body.mood, body.note === undefined ? existing.note : body.note, JSON.stringify(reflection)],
  );
  res.json({ entry: rows[0] });
});

/** Undo a check-in for a day. */
trackersRouter.delete('/:id/entries/:date', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  const date = parse(dateStr, req.params.date);
  await query('DELETE FROM daily_entries WHERE tracker_id = $1 AND entry_date = $2', [t.id, date]);
  res.status(204).end();
});

/* -------------------------------- Stats -------------------------------- */

trackersRouter.get('/:id/today', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  res.json(await todayFor(t, req.user));
});

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
    const start = createdDate(t, req.user.timezone);
    const r = { from: range.from < start ? start : range.from, to: range.to };
    const [expenses, breaks] = await Promise.all([loadExpenses(t.id, r.from, r.to), loadBreaks(t.id, r.from, r.to)]);
    res.json(computeSpendingStats(cfg, req.user.currency, r, today, expenses, breaks));
    return;
  }
  const [{ rows: entries }, { rows: done }] = await Promise.all([
    query(`SELECT entry_date, value, completed, mood, note FROM daily_entries WHERE tracker_id = $1 AND entry_date BETWEEN $2 AND $3`, [t.id, range.from, range.to]),
    query('SELECT entry_date FROM daily_entries WHERE tracker_id = $1 AND completed', [t.id]),
  ]);
  const doneDates = done.map((d) => d.entry_date);
  res.json(computeHabitStats(cfg, range, trackingStart(t, req.user.timezone, doneDates), today, entries, new Set(doneDates)));
});

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
  res.json({ range, breaks: rows.map((r) => ({ ...r, label: RULE_LABELS[r.rule] ?? r.rule })) });
});

/* -------------------------------- Trades -------------------------------- */

export const tradeFields = {
  tradeDate: dateStr.optional(),
  instrument: z.string().trim().max(40).nullable().optional(),
  direction: z.enum(['long', 'short']).nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  entryPrice: z.number().nonnegative().nullable().optional(),
  exitPrice: z.number().nonnegative().nullable().optional(),
  pnl: z.number().min(-1e12).max(1e12),
  fees: z.number().min(0).max(1e10).default(0),
  emotionBefore: z.enum(EMOTIONS).nullable().optional(),
  emotionAfter: z.enum(EMOTIONS).nullable().optional(),
  setup: z.string().trim().max(80).nullable().optional(),
  followedPlan: z.boolean().default(true),
  checklistDone: z.array(z.string().max(120)).max(20).default([]),
  note: z.string().max(4000).nullable().optional(),
  /** Quick day log: one entry standing for several trades, recorded after the fact */
  tradeCount: z.number().int().min(1).max(500).default(1),
  quick: z.boolean().default(false),
};

const createTradeSchema = z.object({
  ...tradeFields,
  override: z.boolean().default(false),
  breakReason: z.string().trim().max(1000).optional(),
});

trackersRouter.get('/:id/trades', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  requireType(t, 'trading');
  const range = resolveRange(todayIn(req.user.timezone), req.query);
  const { rows } = await query(
    `SELECT tr.id, tr.trade_date AS "tradeDate", tr.traded_at AS "tradedAt", tr.instrument, tr.direction,
            tr.quantity, tr.entry_price AS "entryPrice", tr.exit_price AS "exitPrice",
            tr.pnl, tr.fees, (tr.pnl - tr.fees) AS net, tr.emotion_before AS "emotionBefore",
            tr.emotion_after AS "emotionAfter", tr.setup, tr.followed_plan AS "followedPlan",
            tr.checklist_done AS "checklistDone", tr.note, tr.is_rule_break AS "isRuleBreak",
            COALESCE(json_agg(json_build_object('rule', rb.rule, 'description', rb.description, 'reason', rb.reason))
                     FILTER (WHERE rb.id IS NOT NULL), '[]') AS breaks
       FROM trades tr LEFT JOIN rule_breaks rb ON rb.trade_id = tr.id
      WHERE tr.tracker_id = $1 AND tr.trade_date BETWEEN $2 AND $3
      GROUP BY tr.id ORDER BY tr.trade_date DESC, tr.traded_at DESC LIMIT 1000`,
    [t.id, range.from, range.to],
  );
  res.json({
    range,
    trades: rows.map((r) => ({ ...r, breaks: r.breaks.map((b) => ({ ...b, label: RULE_LABELS[b.rule] ?? b.rule })) })),
  });
});

/** Pre-flight: is the trading day locked? */
trackersRouter.get('/:id/status', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  requireType(t, 'trading');
  const cfg = parseConfig('trading', t.config);
  const date = req.query.date ? parse(dateStr, req.query.date) : todayIn(req.user.timezone);
  res.json({ status: await dayStatusFor({ query }, t.id, cfg, date, req.user) });
});

trackersRouter.post('/:id/trades', async (req, res) => {
  const user = req.user;
  const t = await getTracker(user.id, req.params.id);
  requireType(t, 'trading');
  const cfg = parseConfig('trading', t.config);
  const body = parse(createTradeSchema, req.body);
  const today = todayIn(user.timezone);
  const date = body.tradeDate ?? today;
  if (date > today) throw new HttpError(400, 'Cannot log a trade in the future', 'FUTURE_DATE');

  const result = await withTransaction(async (db) => {
    await db.query('SELECT id FROM trackers WHERE id = $1 FOR UPDATE', [t.id]); // serialize per tracker
    const status = await dayStatusFor(db, t.id, cfg, date, user);
    // A quick day log records what already happened, so it is never blocked — but it is still judged
    if (status.locked && date === today && !body.quick) {
      if (!body.override) throw new HttpError(409, 'Your trading day is closed', 'DAY_LOCKED', { status });
      if (!body.breakReason || body.breakReason.length < 10)
        throw new HttpError(400, 'Write down honestly why you are breaking your rule (at least 10 characters)', 'REASON_REQUIRED', { status });
    }

    const { rows } = await db.query(
      `INSERT INTO trades (tracker_id, user_id, trade_date, instrument, direction, quantity, entry_price, exit_price,
                           pnl, fees, emotion_before, emotion_after, setup, followed_plan, checklist_done, note, trade_count, quick)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [t.id, user.id, date, body.instrument || cfg.instrument || null, body.direction ?? null, body.quantity ?? null,
       body.entryPrice ?? null, body.exitPrice ?? null, body.pnl, body.fees, body.emotionBefore ?? null,
       body.emotionAfter ?? null, body.setup ?? null, body.followedPlan, JSON.stringify(body.checklistDone), body.note ?? null, body.tradeCount, body.quick],
    );
    const tradeId = rows[0].id;
    await reevaluateTradingDay(db, {
      trackerId: t.id, userId: user.id, date, cfg, currency: user.currency, timeZone: user.timezone,
      newReasons: body.breakReason ? { [tradeId]: body.breakReason } : undefined,
    });
    const { rows: breaks } = await db.query('SELECT rule, description, reason FROM rule_breaks WHERE trade_id = $1', [tradeId]);
    return {
      tradeId,
      breaks: breaks.map((b) => ({ ...b, label: RULE_LABELS[b.rule] ?? b.rule })),
      status: await dayStatusFor(db, t.id, cfg, date, user),
    };
  });
  res.status(201).json(result);
});

/* ------------------------------- Expenses ------------------------------- */

export const expenseFields = {
  spentOn: dateStr.optional(),
  amount: z.number().positive('Amount must be more than 0').max(1e12),
  category: z.string().trim().min(1).max(30).default('Other'),
  note: z.string().trim().max(500).nullable().optional(),
  breakReason: z.string().trim().max(1000).optional(),
};

trackersRouter.get('/:id/expenses', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  requireType(t, 'spending');
  const range = resolveRange(todayIn(req.user.timezone), req.query);
  const { rows } = await query(
    `SELECT ex.id, ex.spent_on AS "spentOn", ex.amount, ex.category, ex.note, ex.is_rule_break AS "isRuleBreak",
            COALESCE(json_agg(json_build_object('rule', rb.rule, 'description', rb.description))
                     FILTER (WHERE rb.id IS NOT NULL), '[]') AS breaks
       FROM expenses ex LEFT JOIN rule_breaks rb ON rb.expense_id = ex.id
      WHERE ex.tracker_id = $1 AND ex.spent_on BETWEEN $2 AND $3
      GROUP BY ex.id ORDER BY ex.spent_on DESC, ex.created_at DESC LIMIT 1000`,
    [t.id, range.from, range.to],
  );
  res.json({ range, expenses: rows.map((r) => ({ ...r, breaks: r.breaks.map((b) => ({ ...b, label: RULE_LABELS[b.rule] ?? b.rule })) })) });
});

trackersRouter.post('/:id/expenses', async (req, res) => {
  const user = req.user;
  const t = await getTracker(user.id, req.params.id);
  requireType(t, 'spending');
  const cfg = parseConfig('spending', t.config);
  const body = parse(z.object(expenseFields), req.body);
  const today = todayIn(user.timezone);
  const date = body.spentOn ?? today;
  if (date > today) throw new HttpError(400, 'Cannot log a future expense', 'FUTURE_DATE');

  const result = await withTransaction(async (db) => {
    await db.query('SELECT id FROM trackers WHERE id = $1 FOR UPDATE', [t.id]);
    const { rows } = await db.query(
      `INSERT INTO expenses (tracker_id, user_id, spent_on, amount, category, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [t.id, user.id, date, body.amount, body.category, body.note ?? null],
    );
    const expenseId = rows[0].id;
    await reevaluateSpendingMonth(db, {
      trackerId: t.id, userId: user.id, month: date.slice(0, 7), cfg, currency: user.currency, weekdayOf,
      newReasons: body.breakReason ? { [expenseId]: body.breakReason } : undefined,
    });
    const { rows: breaks } = await db.query('SELECT rule, description FROM rule_breaks WHERE expense_id = $1', [expenseId]);
    return { expenseId, breaks: breaks.map((b) => ({ ...b, label: RULE_LABELS[b.rule] ?? b.rule })) };
  });
  res.status(201).json(result);
});
