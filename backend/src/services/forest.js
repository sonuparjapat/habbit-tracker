/**
 * "Your forest" — a playful view of the same honest data:
 * every day you keep your promises plants a tree; a day where broken rules outweigh the good ones withers.
 * Derived entirely from existing activity (nothing stored), so it can never drift from the truth.
 */
import { query } from '../db/pool.js';
import { addDays, todayIn } from '../utils/date.js';

export const FOREST_STAGES = [
  { min: 0, name: 'Bare land', emoji: '🟫' },
  { min: 1, name: 'First sprout', emoji: '🌱' },
  { min: 7, name: 'Little grove', emoji: '🌿' },
  { min: 30, name: 'Young woods', emoji: '🌳' },
  { min: 90, name: 'Deep forest', emoji: '🌲' },
  { min: 180, name: 'Ancient forest', emoji: '🏞️' },
  { min: 365, name: 'Legendary rainforest', emoji: '🌴' },
];

/** -1 withered · 0 nothing · 1 sprout · 2 tree · 3 grand tree */
export function treeFor(good, bad) {
  if (bad > 0 && bad >= good) return -1;
  if (good <= 0) return 0;
  if (good >= 4 && bad === 0) return 3;
  if (good >= 2) return 2;
  return 1;
}

const DATE = (col) => `to_char(${col}, 'YYYY-MM-DD')`;

async function dailyActivity(userId) {
  const { rows } = await query(
    `SELECT d, sum(good)::int AS good, sum(bad)::int AS bad FROM (
       SELECT ${DATE('entry_date')} AS d, count(*) AS good, 0 AS bad FROM daily_entries WHERE user_id = $1 AND completed GROUP BY 1
       UNION ALL
       SELECT ${DATE('trade_date')}, sum(trade_count), 0 FROM trades WHERE user_id = $1 AND NOT is_rule_break GROUP BY 1
       UNION ALL
       SELECT ${DATE('spent_on')}, count(*), 0 FROM expenses WHERE user_id = $1 AND NOT is_rule_break GROUP BY 1
       UNION ALL
       SELECT ${DATE('break_date')}, 0, count(*) FROM rule_breaks WHERE user_id = $1 GROUP BY 1
     ) x GROUP BY d`,
    [userId],
  );
  return new Map(rows.map((r) => [r.d, { good: r.good, bad: r.bad }]));
}

export async function forestFor(user, days = 84) {
  const activity = await dailyActivity(user.id);
  const today = todayIn(user.timezone);

  let alive = 0;
  let withered = 0;
  let grand = 0;
  for (const { good, bad } of activity.values()) {
    const t = treeFor(good, bad);
    if (t > 0) alive++;
    if (t === 3) grand++;
    if (t === -1) withered++;
  }

  // Recent grid, oldest first (the app lays it out as a field)
  const grid = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const a = activity.get(date) ?? { good: 0, bad: 0 };
    grid.push({ date, good: a.good, bad: a.bad, tree: treeFor(a.good, a.bad) });
  }

  // Current growing streak: consecutive days (ending today or yesterday) that planted a tree
  let streak = 0;
  for (let i = grid.length - 1; i >= 0; i--) {
    const t = grid[i].tree;
    if (t > 0) streak++;
    else if (i === grid.length - 1 && t === 0) continue; // today not logged yet doesn't break it
    else break;
  }

  const last30 = grid.slice(-30).filter((d) => d.tree !== 0);
  const health = last30.length ? Math.round((last30.filter((d) => d.tree > 0).length / last30.length) * 100) : null;

  const idx = FOREST_STAGES.reduce((acc, s, i) => (alive >= s.min ? i : acc), 0);
  const stage = FOREST_STAGES[idx];
  const next = FOREST_STAGES[idx + 1] ?? null;

  return {
    today,
    alive,
    withered,
    grand,
    streak,
    health,
    stage: { ...stage, index: idx },
    next: next ? { ...next, treesToGo: next.min - alive } : null,
    todayTree: grid[grid.length - 1].tree,
    grid,
  };
}
