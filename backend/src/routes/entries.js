/**
 * Edit or delete one trade / one expense by its own id.
 * After every change the affected day (trades) or month (expenses) is judged again,
 * so rule breaks always match what is saved.
 *
 *   PATCH  /api/trades/:id      edit a trade
 *   DELETE /api/trades/:id      delete a trade
 *   PATCH  /api/expenses/:id    edit an expense
 *   DELETE /api/expenses/:id    delete an expense
 */
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';
import { HttpError, isUuid, parse } from '../middleware/errors.js';
import { reevaluateSpendingMonth, reevaluateTradingDay } from '../services/rules.js';
import { parseConfig } from '../services/trackerConfig.js';
import { getTracker } from '../services/trackers.js';
import { todayIn, weekdayOf } from '../utils/date.js';
import { expenseFields } from './trackerExpenses.js';
import { tradeFields } from './trackerTrades.js';

export const tradesRouter = Router();
export const expensesRouter = Router();

async function loadOwned(table, dateCol, userId, id) {
  if (!isUuid(id)) throw new HttpError(404, 'Not found', 'NOT_FOUND');
  const { rows } = await query(`SELECT id, tracker_id, ${dateCol} AS date FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!rows[0]) throw new HttpError(404, 'Not found', 'NOT_FOUND');
  return rows[0];
}

function buildUpdate(body, columns) {
  const sets = [];
  const values = [];
  for (const [key, col] of Object.entries(columns)) {
    if (body[key] === undefined) continue;
    values.push(key === 'checklistDone' ? JSON.stringify(body[key]) : body[key]);
    sets.push(`${col} = $${values.length + 1}`);
  }
  return { sets, values };
}

/* --------------------------------- Trades --------------------------------- */

const TRADE_COLUMNS = {
  tradeDate: 'trade_date', instrument: 'instrument', direction: 'direction', quantity: 'quantity',
  entryPrice: 'entry_price', exitPrice: 'exit_price', pnl: 'pnl', fees: 'fees', emotionBefore: 'emotion_before',
  emotionAfter: 'emotion_after', setup: 'setup', followedPlan: 'followed_plan', checklistDone: 'checklist_done', note: 'note',
};

const tradeUpdate = z
  .object({
    ...tradeFields,
    fees: z.number().min(0).max(1e10),
    followedPlan: z.boolean(),
    checklistDone: z.array(z.string().max(120)).max(20),
    breakReason: z.string().trim().max(1000),
  })
  .partial();

async function retradeDays(db, user, tracker, dates, newReasons) {
  const cfg = parseConfig('trading', tracker.config);
  for (const date of new Set(dates))
    await reevaluateTradingDay(db, { trackerId: tracker.id, userId: user.id, date, cfg, currency: user.currency, timeZone: user.timezone, newReasons });
}

tradesRouter.patch('/:id', async (req, res) => {
  const trade = await loadOwned('trades', 'trade_date', req.user.id, req.params.id);
  const tracker = await getTracker(req.user.id, trade.tracker_id);
  const body = parse(tradeUpdate, req.body);
  if (body.tradeDate && body.tradeDate > todayIn(req.user.timezone)) throw new HttpError(400, 'Cannot move a trade into the future', 'FUTURE_DATE');
  const { sets, values } = buildUpdate(body, TRADE_COLUMNS);
  await withTransaction(async (db) => {
    if (sets.length) await db.query(`UPDATE trades SET ${sets.join(', ')} WHERE id = $1`, [trade.id, ...values]);
    await retradeDays(db, req.user, tracker, [trade.date, body.tradeDate ?? trade.date], body.breakReason ? { [trade.id]: body.breakReason } : undefined);
  });
  res.json({ ok: true });
});

tradesRouter.delete('/:id', async (req, res) => {
  const trade = await loadOwned('trades', 'trade_date', req.user.id, req.params.id);
  const tracker = await getTracker(req.user.id, trade.tracker_id);
  await withTransaction(async (db) => {
    await db.query('DELETE FROM trades WHERE id = $1', [trade.id]);
    await retradeDays(db, req.user, tracker, [trade.date]);
  });
  res.status(204).end();
});

/* -------------------------------- Expenses -------------------------------- */

const EXPENSE_COLUMNS = { spentOn: 'spent_on', amount: 'amount', category: 'category', note: 'note' };
const expenseUpdate = z.object({ ...expenseFields, category: z.string().trim().min(1).max(30) }).partial();

async function respend(db, user, tracker, dates, newReasons) {
  const cfg = parseConfig('spending', tracker.config);
  for (const month of new Set(dates.map((d) => d.slice(0, 7))))
    await reevaluateSpendingMonth(db, { trackerId: tracker.id, userId: user.id, month, cfg, currency: user.currency, weekdayOf, newReasons });
}

expensesRouter.patch('/:id', async (req, res) => {
  const exp = await loadOwned('expenses', 'spent_on', req.user.id, req.params.id);
  const tracker = await getTracker(req.user.id, exp.tracker_id);
  const body = parse(expenseUpdate, req.body);
  if (body.spentOn && body.spentOn > todayIn(req.user.timezone)) throw new HttpError(400, 'Cannot move an expense into the future', 'FUTURE_DATE');
  const { sets, values } = buildUpdate(body, EXPENSE_COLUMNS);
  await withTransaction(async (db) => {
    if (sets.length) await db.query(`UPDATE expenses SET ${sets.join(', ')} WHERE id = $1`, [exp.id, ...values]);
    await respend(db, req.user, tracker, [exp.date, body.spentOn ?? exp.date], body.breakReason ? { [exp.id]: body.breakReason } : undefined);
  });
  res.json({ ok: true });
});

expensesRouter.delete('/:id', async (req, res) => {
  const exp = await loadOwned('expenses', 'spent_on', req.user.id, req.params.id);
  const tracker = await getTracker(req.user.id, exp.tracker_id);
  await withTransaction(async (db) => {
    await db.query('DELETE FROM expenses WHERE id = $1', [exp.id]);
    await respend(db, req.user, tracker, [exp.date]);
  });
  res.status(204).end();
});
