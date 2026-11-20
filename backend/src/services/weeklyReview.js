/**
 * Sunday weekly review: how the week went, tracker by tracker, plus three reflection questions.
 * Like everything else, the numbers are calculated from what was logged (only the answers are stored).
 *
 * Which week? On Sunday it's the week ending today; on any other day it's last week
 * (so "review your week" on Monday morning still works).
 */
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { addDays, eachDay, todayIn, weekdayOf } from '../utils/date.js';
import { dailyActivity, treeFor } from './forest.js';
import { round2 } from './rules.js';
import { parseConfig } from './trackerConfig.js';
import { createdDate } from './trackers.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const mondayOf = (date) => addDays(date, -((weekdayOf(date) + 6) % 7));

/** The week the review is about (its Monday). */
export function defaultReviewWeek(today) {
  return weekdayOf(today) === 0 ? mondayOf(today) : addDays(mondayOf(today), -7);
}

/** Throws unless `weekStart` is a Monday of a week that has started. */
export function assertReviewableWeek(weekStart, today) {
  if (weekdayOf(weekStart) !== 1) throw new HttpError(400, 'A week starts on a Monday', 'VALIDATION');
  if (weekStart > today) throw new HttpError(400, 'That week hasn’t started yet', 'VALIDATION');
}

export async function weeklyReview(user, weekStart) {
  const today = todayIn(user.timezone);
  assertReviewableWeek(weekStart, today);
  const weekEnd = addDays(weekStart, 6);
  const lastDay = weekEnd < today ? weekEnd : today; // don't judge days that haven't happened

  const [{ rows: trackers }, activity, { rows: saved }] = await Promise.all([
    query('SELECT * FROM trackers WHERE user_id = $1 AND NOT archived ORDER BY sort_order, created_at', [user.id]),
    dailyActivity(user.id),
    query('SELECT answers FROM weekly_reviews WHERE user_id = $1 AND week_start = $2', [user.id, weekStart]),
  ]);

  const items = [];
  let planned = 0;
  let done = 0;
  for (const t of trackers) {
    const cfg = parseConfig(t.type, t.config);
    const start = createdDate(t, user.timezone);
    const from = start > weekStart ? start : weekStart;
    if (from > lastDay) continue; // created after this week
    const base = { trackerId: t.id, type: t.type, name: t.name, icon: t.icon, color: t.color };

    if (t.type === 'habit') {
      const { rows } = await query(
        `SELECT to_char(entry_date, 'YYYY-MM-DD') AS d FROM daily_entries WHERE tracker_id = $1 AND completed AND entry_date BETWEEN $2 AND $3`,
        [t.id, from, lastDay],
      );
      const doneDays = new Set(rows.map((r) => r.d));
      let p = 0;
      for (const d of eachDay(from, lastDay)) if (cfg.days.includes(weekdayOf(d))) p++;
      const n = [...doneDays].filter((d) => cfg.days.includes(weekdayOf(d))).length;
      planned += p;
      done += n;
      items.push({ ...base, done: n, planned: p });
    } else if (t.type === 'trading') {
      const { rows } = await query(
        `SELECT count(DISTINCT trade_date)::int AS days, count(DISTINCT trade_date) FILTER (WHERE NOT is_rule_break)::int AS clean_days,
                COALESCE(sum(trade_count), 0)::int AS trades, COALESCE(sum(pnl - fees), 0)::float8 AS net
           FROM trades WHERE tracker_id = $1 AND trade_date BETWEEN $2 AND $3`,
        [t.id, from, lastDay],
      );
      const { rows: broken } = await query(
        `SELECT count(DISTINCT break_date)::int AS n FROM rule_breaks WHERE tracker_id = $1 AND break_date BETWEEN $2 AND $3`,
        [t.id, from, lastDay],
      );
      const r = rows[0];
      items.push({ ...base, tradingDays: r.days, cleanDays: r.days - broken[0].n, trades: r.trades, net: round2(r.net) });
    } else {
      const { rows } = await query(
        `SELECT COALESCE(sum(amount), 0)::float8 AS spent FROM expenses WHERE tracker_id = $1 AND spent_on BETWEEN $2 AND $3`,
        [t.id, from, lastDay],
      );
      const { rows: over } = await query(
        `SELECT count(DISTINCT break_date)::int AS n FROM rule_breaks WHERE tracker_id = $1 AND rule = 'over_daily' AND break_date BETWEEN $2 AND $3`,
        [t.id, from, lastDay],
      );
      items.push({ ...base, spent: round2(rows[0].spent), daysOverBudget: over[0].n, dailyLimit: cfg.dailyLimit });
    }
  }

  // The forest's week + the best day
  let grown = 0;
  let withered = 0;
  let best = null;
  for (const d of eachDay(weekStart, lastDay)) {
    const a = activity.get(d) ?? { good: 0, bad: 0 };
    const tree = treeFor(a.good, a.bad);
    if (tree > 0) grown++;
    if (tree === -1) withered++;
    if (a.good > 0 && (!best || a.good > best.good)) best = { date: d, day: DAY_NAMES[weekdayOf(d)], good: a.good };
  }

  // Compare with the week before (habits only — the clearest signal)
  const previous = await habitRate(user, trackers, addDays(weekStart, -7), addDays(weekStart, -1));

  const rate = planned ? Math.round((done / planned) * 100) : null;
  return {
    weekStart,
    weekEnd,
    complete: weekEnd <= today,
    habits: { done, planned, rate, previousRate: previous },
    items,
    forest: { grown, withered },
    bestDay: best,
    answers: saved[0]?.answers ?? {},
  };
}

/** % of planned habit days done in a date range (null if nothing was planned). */
async function habitRate(user, trackers, from, to) {
  let planned = 0;
  let done = 0;
  for (const t of trackers.filter((x) => x.type === 'habit')) {
    const cfg = parseConfig('habit', t.config);
    const start = createdDate(t, user.timezone);
    const first = start > from ? start : from;
    if (first > to) continue;
    for (const d of eachDay(first, to)) if (cfg.days.includes(weekdayOf(d))) planned++;
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM daily_entries WHERE tracker_id = $1 AND completed AND entry_date BETWEEN $2 AND $3`,
      [t.id, first, to],
    );
    done += rows[0].n;
  }
  return planned ? Math.min(100, Math.round((done / planned) * 100)) : null;
}

/** Save the member's answers for a week (merging with what was saved before). */
export async function saveReviewAnswers(userId, weekStart, answers) {
  const { rows } = await query(
    `INSERT INTO weekly_reviews (user_id, week_start, answers) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, week_start) DO UPDATE SET answers = weekly_reviews.answers || EXCLUDED.answers, updated_at = now()
     RETURNING answers`,
    [userId, weekStart, JSON.stringify(answers)],
  );
  return rows[0].answers;
}
