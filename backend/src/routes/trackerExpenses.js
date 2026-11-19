/**
 * Money (spending) trackers: list expenses and add a new one.
 * (Editing / deleting one expense by its own id lives in routes/entries.js.)
 *
 *   GET  /api/trackers/:id/expenses   expenses in a date range, each with its rule breaks
 *   POST /api/trackers/:id/expenses   add an expense and judge it against the budgets
 */
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { HttpError, parse } from '../middleware/errors.js';
import { reevaluateSpendingMonth, withLabels } from '../services/rules.js';
import { parseConfig } from '../services/trackerConfig.js';
import { getTracker, requireType } from '../services/trackers.js';
import { resolveRange, todayIn, weekdayOf } from '../utils/date.js';
import { dateStr } from '../utils/validation.js';

export const trackerExpensesRouter = Router();

/** Fields of an expense. Also used when editing an expense (routes/entries.js). */
export const expenseFields = {
  spentOn: dateStr.optional(),
  amount: z.number().positive('Amount must be more than 0').max(1e12),
  category: z.string().trim().min(1).max(30).default('Other'),
  note: z.string().trim().max(500).nullable().optional(),
  breakReason: z.string().trim().max(1000).optional(),
};

/** GET /api/trackers/:id/expenses?from=&to= — expenses in a date range, newest first. */
trackerExpensesRouter.get('/:id/expenses', async (req, res) => {
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
  const expenses = rows.map((expense) => ({ ...expense, breaks: withLabels(expense.breaks) }));
  res.json({ range, expenses });
});

/**
 * POST /api/trackers/:id/expenses — add an expense.
 * Saves it, then re-judges the whole month (the monthly budget depends on every expense in it).
 */
trackerExpensesRouter.post('/:id/expenses', async (req, res) => {
  const user = req.user;
  const t = await getTracker(user.id, req.params.id);
  requireType(t, 'spending');
  const cfg = parseConfig('spending', t.config);
  const body = parse(z.object(expenseFields), req.body);
  const today = todayIn(user.timezone);
  const date = body.spentOn ?? today;
  if (date > today) throw new HttpError(400, 'Cannot log a future expense', 'FUTURE_DATE');

  const result = await withTransaction(async (db) => {
    // Lock this tracker's row so two expenses sent at the same moment are judged one after the other
    await db.query('SELECT id FROM trackers WHERE id = $1 FOR UPDATE', [t.id]);
    const { rows } = await db.query(
      `INSERT INTO expenses (tracker_id, user_id, spent_on, amount, category, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [t.id, user.id, date, body.amount, body.category, body.note ?? null],
    );
    const expenseId = rows[0].id;
    await reevaluateSpendingMonth(db, {
      trackerId: t.id,
      userId: user.id,
      month: date.slice(0, 7),
      cfg,
      currency: user.currency,
      weekdayOf,
      newReasons: body.breakReason ? { [expenseId]: body.breakReason } : undefined,
    });
    const { rows: breaks } = await db.query('SELECT rule, description FROM rule_breaks WHERE expense_id = $1', [expenseId]);
    return { expenseId, breaks: withLabels(breaks) };
  });
  res.status(201).json(result);
});
