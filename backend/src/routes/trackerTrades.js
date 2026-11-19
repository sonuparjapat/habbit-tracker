/**
 * Trading trackers: list trades, check if the day is locked, and log a new trade.
 * (Editing / deleting one trade by its own id lives in routes/entries.js.)
 *
 *   GET  /api/trackers/:id/trades   trades in a date range, each with its rule breaks
 *   GET  /api/trackers/:id/status   is today locked? (trade count, P&L, limits hit, cool-off, tilt)
 *   POST /api/trackers/:id/trades   log a trade (or a quick whole-day log) and judge it
 */
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { HttpError, parse } from '../middleware/errors.js';
import { reevaluateTradingDay, withLabels } from '../services/rules.js';
import { EMOTIONS, parseConfig } from '../services/trackerConfig.js';
import { dayStatusFor, getTracker, requireType } from '../services/trackers.js';
import { resolveRange, todayIn } from '../utils/date.js';
import { dateStr } from '../utils/validation.js';

export const trackerTradesRouter = Router();

/** Fields of a trade. Also used when editing a trade (routes/entries.js). */
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
  /** The day is locked but the member chose to trade anyway… */
  override: z.boolean().default(false),
  /** …and must honestly say why */
  breakReason: z.string().trim().max(1000).optional(),
});

/** GET /api/trackers/:id/trades?from=&to= — trades in a date range, newest first. */
trackerTradesRouter.get('/:id/trades', async (req, res) => {
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
  const trades = rows.map((trade) => ({ ...trade, breaks: withLabels(trade.breaks) }));
  res.json({ range, trades });
});

/** GET /api/trackers/:id/status?date= — the app asks this before showing the "Log trade" form. */
trackerTradesRouter.get('/:id/status', async (req, res) => {
  const t = await getTracker(req.user.id, req.params.id);
  requireType(t, 'trading');
  const cfg = parseConfig('trading', t.config);
  const date = req.query.date ? parse(dateStr, req.query.date) : todayIn(req.user.timezone);
  res.json({ status: await dayStatusFor({ query }, t.id, cfg, date, req.user) });
});

/**
 * POST /api/trackers/:id/trades — log a trade.
 *
 * Steps:
 *   1. If today is locked (limit hit, cool-off, tilt…), refuse — unless the member overrides
 *      AND writes a reason. A quick day log is never refused: it records what already happened.
 *   2. Save the trade.
 *   3. Re-judge the whole day (and later days that depend on it) → rule breaks.
 *   4. Reply with this trade's rule breaks and the day's new status.
 */
trackerTradesRouter.post('/:id/trades', async (req, res) => {
  const user = req.user;
  const t = await getTracker(user.id, req.params.id);
  requireType(t, 'trading');
  const cfg = parseConfig('trading', t.config);
  const body = parse(createTradeSchema, req.body);
  const today = todayIn(user.timezone);
  const date = body.tradeDate ?? today;
  if (date > today) throw new HttpError(400, 'Cannot log a trade in the future', 'FUTURE_DATE');

  const result = await withTransaction(async (db) => {
    // Lock this tracker's row so two trades sent at the same moment are judged one after the other
    await db.query('SELECT id FROM trackers WHERE id = $1 FOR UPDATE', [t.id]);

    // 1. Is the day closed?
    const status = await dayStatusFor(db, t.id, cfg, date, user);
    if (status.locked && date === today && !body.quick) {
      if (!body.override) throw new HttpError(409, 'Your trading day is closed', 'DAY_LOCKED', { status });
      if (!body.breakReason || body.breakReason.length < 10)
        throw new HttpError(400, 'Write down honestly why you are breaking your rule (at least 10 characters)', 'REASON_REQUIRED', { status });
    }

    // 2. Save it
    const { rows } = await db.query(
      `INSERT INTO trades (tracker_id, user_id, trade_date, instrument, direction, quantity, entry_price, exit_price,
                           pnl, fees, emotion_before, emotion_after, setup, followed_plan, checklist_done, note, trade_count, quick)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [
        t.id,
        user.id,
        date,
        body.instrument || cfg.instrument || null,
        body.direction ?? null,
        body.quantity ?? null,
        body.entryPrice ?? null,
        body.exitPrice ?? null,
        body.pnl,
        body.fees,
        body.emotionBefore ?? null,
        body.emotionAfter ?? null,
        body.setup ?? null,
        body.followedPlan,
        JSON.stringify(body.checklistDone),
        body.note ?? null,
        body.tradeCount,
        body.quick,
      ],
    );
    const tradeId = rows[0].id;

    // 3. Judge the day
    await reevaluateTradingDay(db, {
      trackerId: t.id,
      userId: user.id,
      date,
      cfg,
      currency: user.currency,
      timeZone: user.timezone,
      newReasons: body.breakReason ? { [tradeId]: body.breakReason } : undefined,
    });

    // 4. Reply
    const { rows: breaks } = await db.query('SELECT rule, description, reason FROM rule_breaks WHERE trade_id = $1', [tradeId]);
    return {
      tradeId,
      breaks: withLabels(breaks),
      status: await dayStatusFor(db, t.id, cfg, date, user),
    };
  });
  res.status(201).json(result);
});
