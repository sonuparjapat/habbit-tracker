import { query } from '../db/pool.js';
import { HttpError, isUuid } from '../middleware/errors.js';
import { addDays, dateIn, todayIn, weekdayOf } from '../utils/date.js';
import { habitStreaks } from './habitStats.js';
import { computeDayStatus, computeSpendStatus, money } from './rules.js';
import { parseConfig } from './trackerConfig.js';
import { computeStreaks, tradingAlerts } from './tradingStats.js';

export function serializeTracker(t) {
  return {
    id: t.id,
    type: t.type,
    category: t.category,
    name: t.name,
    icon: t.icon,
    color: t.color,
    config: parseConfig(t.type, t.config),
    templateSlug: t.template_slug,
    archived: t.archived,
    sortOrder: t.sort_order,
    createdAt: t.created_at,
  };
}

export async function getTracker(userId, id, db = { query }) {
  if (!isUuid(id)) throw new HttpError(404, 'Tracker not found', 'NOT_FOUND');
  const { rows } = await db.query('SELECT * FROM trackers WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rows[0]) throw new HttpError(404, 'Tracker not found', 'NOT_FOUND');
  return rows[0];
}

export function requireType(t, type) {
  if (t.type !== type) throw new HttpError(400, `This is not a ${type} tracker`, 'WRONG_TYPE');
}

export const createdDate = (t, timeZone) => dateIn(new Date(t.created_at), timeZone);

export async function loadTrades(trackerId, from, to) {
  const { rows } = await query(
    `SELECT id, trade_date, (pnl - fees)::float8 AS net, is_rule_break, emotion_before, followed_plan
       FROM trades WHERE tracker_id = $1 AND trade_date BETWEEN $2 AND $3
      ORDER BY trade_date, traded_at, created_at`,
    [trackerId, from, to],
  );
  return rows;
}

export async function loadBreaks(trackerId, from, to) {
  const { rows } = await query(
    'SELECT break_date, rule, trade_id, expense_id FROM rule_breaks WHERE tracker_id = $1 AND break_date BETWEEN $2 AND $3',
    [trackerId, from, to],
  );
  return rows;
}

export async function loadExpenses(trackerId, from, to) {
  const { rows } = await query(
    `SELECT id, spent_on, amount::float8 AS amount, category, note, is_rule_break
       FROM expenses WHERE tracker_id = $1 AND spent_on BETWEEN $2 AND $3 ORDER BY spent_on, created_at`,
    [trackerId, from, to],
  );
  return rows;
}

/* --------------------------------- Today --------------------------------- */

export async function tradingToday(t, user) {
  const cfg = parseConfig('trading', t.config);
  const today = todayIn(user.timezone);
  const [allTrades, allBreaks, journal] = await Promise.all([
    loadTrades(t.id, '2000-01-01', today),
    loadBreaks(t.id, '2000-01-01', today),
    query('SELECT completed FROM daily_entries WHERE tracker_id = $1 AND entry_date = $2', [t.id, today]),
  ]);
  const status = computeDayStatus(cfg, today, weekdayOf(today), allTrades.filter((x) => x.trade_date === today), user.currency);
  const streaks = computeStreaks(allTrades, allBreaks);
  const weekAgo = addDays(today, -6);
  const breaksLast7Days = allBreaks.filter((b) => b.break_date >= weekAgo).length;
  return {
    date: today,
    status,
    streaks,
    breaksToday: allBreaks.filter((b) => b.break_date === today).length,
    breaksLast7Days,
    journalDone: Boolean(journal.rows[0]?.completed),
    alerts: tradingAlerts(cfg, user.currency, status, streaks, breaksLast7Days),
  };
}

export async function habitToday(t, user) {
  const cfg = parseConfig('habit', t.config);
  const today = todayIn(user.timezone);
  const { rows } = await query(
    'SELECT entry_date, value, completed FROM daily_entries WHERE tracker_id = $1 AND entry_date <= $2',
    [t.id, today],
  );
  const done = new Set(rows.filter((r) => r.completed).map((r) => r.entry_date));
  const todayRow = rows.find((r) => r.entry_date === today);
  const streak = habitStreaks(cfg, done, createdDate(t, user.timezone), today);
  return {
    date: today,
    scheduledToday: cfg.days.includes(weekdayOf(today)),
    loggedToday: Boolean(todayRow),
    completedToday: Boolean(todayRow?.completed),
    valueToday: todayRow?.value ?? 0,
    overLimit: cfg.kind === 'limit' && Boolean(todayRow) && todayRow.value > cfg.target,
    currentStreak: streak.current,
    bestStreak: streak.best,
  };
}

export async function spendingToday(t, user) {
  const cfg = parseConfig('spending', t.config);
  const today = todayIn(user.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  const expenses = await loadExpenses(t.id, monthStart, today);
  const spentToday = expenses.filter((e) => e.spent_on === today).reduce((s, e) => s + e.amount, 0);
  const spentMonth = expenses.reduce((s, e) => s + e.amount, 0);
  const status = computeSpendStatus(cfg, today, weekdayOf(today), spentToday, spentMonth, user.currency);

  // Consecutive past days under the daily limit (and no-spend days kept)
  const byDay = new Map();
  for (const e of await loadExpenses(t.id, addDays(today, -120), today)) byDay.set(e.spent_on, (byDay.get(e.spent_on) ?? 0) + e.amount);
  let streak = 0;
  const start = createdDate(t, user.timezone);
  for (let d = addDays(today, -1); d >= start; d = addDays(d, -1)) {
    const amount = byDay.get(d) ?? 0;
    const ok = (cfg.dailyLimit === 0 || amount <= cfg.dailyLimit) && (!cfg.noSpendDays.includes(weekdayOf(d)) || amount === 0);
    if (!ok) break;
    streak++;
  }

  const alerts = [];
  const m = (n) => money(n, user.currency);
  if (status.noSpendDay && spentToday === 0) alerts.push({ level: 'info', title: 'No-spend day', message: 'Today you planned to spend nothing. You can do this.' });
  if (status.noSpendDay && spentToday > 0) alerts.push({ level: 'danger', title: 'No-spend day broken', message: `You spent ${m(spentToday)} on a no-spend day.` });
  if (status.overDaily) alerts.push({ level: 'danger', title: 'Daily budget crossed', message: `${m(spentToday)} spent today against ${m(cfg.dailyLimit)}. Stop for today.` });
  else if (cfg.dailyLimit > 0 && spentToday >= 0.8 * cfg.dailyLimit)
    alerts.push({ level: 'warning', title: 'Almost at your daily budget', message: `${m(cfg.dailyLimit - spentToday)} left for today.` });
  if (status.overMonthly) alerts.push({ level: 'danger', title: 'Monthly budget crossed', message: `${m(spentMonth)} spent this month against ${m(cfg.monthlyLimit)}.` });

  return { date: today, status, streak, alerts };
}

export const todayFor = (t, user) =>
  t.type === 'trading' ? tradingToday(t, user) : t.type === 'spending' ? spendingToday(t, user) : habitToday(t, user);
