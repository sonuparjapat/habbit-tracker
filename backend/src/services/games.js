/**
 * Mini-games, one for each kind of tracker. Like the forest, every game is *calculated* from what the
 * member logged — nothing is stored, so nothing can drift or be faked.
 *
 *   Weekly boss   (everyone)          every promise kept hits the boss, every rule broken heals it
 *   Piggy bank    (money trackers)    money left under your daily / monthly budget this month
 *   Fortress      (trading trackers)  each clean trading day adds a brick; rule-break days crack it
 *   Money saved   (quit / limit habits with a "cost per bad day")  clean days × that cost
 */
import { query } from '../db/pool.js';
import { addDays, daysInMonth, eachDay, todayIn, weekdayOf } from '../utils/date.js';
import { dailyActivity } from './forest.js';
import { round2 } from './rules.js';
import { parseConfig } from './trackerConfig.js';
import { createdDate } from './trackers.js';

/* ------------------------------ Weekly boss ------------------------------ */

export const BOSSES = [
  { key: 'procrastinator', name: 'The Procrastinator', emoji: '🦥', taunt: 'Tomorrow… you’ll start tomorrow.' },
  { key: 'scroller', name: 'Sir Scroll-a-lot', emoji: '📱', taunt: 'Just five more minutes of scrolling.' },
  { key: 'snooze', name: 'The Snooze Goblin', emoji: '😴', taunt: 'Hit snooze. You deserve it.' },
  { key: 'impulse', name: 'Captain Impulse', emoji: '🛒', taunt: 'Buy it now, think later!' },
  { key: 'revenge', name: 'The Revenge Bull', emoji: '🐂', taunt: 'Win it all back. One more trade!' },
  { key: 'excuse', name: 'Lord Excuse', emoji: '🤥', taunt: 'You had a long day. Skip it.' },
  { key: 'kraken', name: 'The Sugar Kraken', emoji: '🐙', taunt: 'One little treat won’t hurt.' },
  { key: 'dragon', name: 'The Doubt Dragon', emoji: '🐉', taunt: 'You never finish anything anyway.' },
];

/** Monday of the week that contains `date`. */
const mondayOf = (date) => addDays(date, -((weekdayOf(date) + 6) % 7));

/** A different boss every week, the same for everyone that week. */
function bossOfWeek(monday) {
  const weekNumber = Math.floor(Date.parse(`${monday}T00:00:00Z`) / (7 * 86_400_000));
  return BOSSES[weekNumber % BOSSES.length];
}

/** Each kept promise = 1 damage. Each broken rule heals the boss by this much. */
export const HEAL_PER_BREAK = 2;

/**
 * The boss's health is how many promises the member planned this week:
 * every scheduled habit day, plus 3 per trading / money tracker. At least 10.
 */
function bossHealth(trackers, monday) {
  let planned = 0;
  for (const t of trackers) {
    if (t.type === 'habit') {
      const cfg = parseConfig('habit', t.config);
      for (let i = 0; i < 7; i++) if (cfg.days.includes(weekdayOf(addDays(monday, i)))) planned++;
    } else {
      planned += 3;
    }
  }
  return Math.max(10, planned);
}

function weeklyBoss(trackers, activity, today) {
  const monday = mondayOf(today);
  const boss = bossOfWeek(monday);
  const maxHp = bossHealth(trackers, monday);

  let hits = 0;
  let heals = 0;
  for (const day of eachDay(monday, today)) {
    const a = activity.get(day);
    if (!a) continue;
    hits += a.good;
    heals += a.bad;
  }
  const damage = hits - heals * HEAL_PER_BREAK;
  const hp = Math.min(maxHp, Math.max(0, maxHp - damage));

  return {
    ...boss,
    weekStart: monday,
    daysLeft: 6 - ((weekdayOf(today) + 6) % 7), // days after today until Sunday
    maxHp,
    hp,
    hits,
    heals,
    defeated: hp === 0,
  };
}

/* ------------------------------- Piggy bank ------------------------------- */

function piggyBank(t, cfg, spentByDay, today, timeZone) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const created = createdDate(t, timeZone);
  const start = created > monthStart ? created : monthStart;
  let saved = 0;
  let daysUnder = 0;
  let daysOver = 0;
  let goal = 0;

  if (cfg.dailyLimit > 0) {
    // Every day under the daily budget drops the money you didn't spend into the jar
    for (const day of eachDay(start, today)) {
      const spent = spentByDay.get(day) ?? 0;
      if (spent <= cfg.dailyLimit) {
        saved += cfg.dailyLimit - spent;
        daysUnder++;
      } else {
        daysOver++;
      }
    }
    goal = cfg.dailyLimit * daysInMonth(today);
  } else if (cfg.monthlyLimit > 0) {
    // Only a monthly budget: compare spending with the budget "used up" so far this month
    const dim = daysInMonth(today);
    const elapsed = Number(today.slice(8, 10));
    let spentMonth = 0;
    for (const [day, amount] of spentByDay) if (day >= monthStart) spentMonth += amount;
    saved = Math.max(0, (cfg.monthlyLimit * elapsed) / dim - spentMonth);
    goal = cfg.monthlyLimit;
  } else {
    return null; // no budget set — nothing to measure against
  }

  return {
    trackerId: t.id,
    name: t.name,
    color: t.color,
    saved: round2(saved),
    goal: round2(goal),
    fill: goal > 0 ? Math.min(1, saved / goal) : 0,
    daysUnder,
    daysOver,
  };
}

/* -------------------------------- Fortress -------------------------------- */

export const FORTRESS_LEVELS = [
  { min: 0, name: 'Camp', emoji: '⛺' },
  { min: 3, name: 'Hut', emoji: '🛖' },
  { min: 10, name: 'Stone house', emoji: '🏠' },
  { min: 25, name: 'Fort', emoji: '🏯' },
  { min: 50, name: 'Castle', emoji: '🏰' },
  { min: 100, name: 'Citadel', emoji: '👑' },
];

function fortress(t, days) {
  // days: [{ date, broken }] — every day this tracker had trades, oldest first
  const bricks = days.filter((d) => !d.broken).length;
  const cracks = days.length - bricks;
  let streak = 0;
  for (let i = days.length - 1; i >= 0 && !days[i].broken; i--) streak++;

  const index = FORTRESS_LEVELS.reduce((acc, level, i) => (bricks >= level.min ? i : acc), 0);
  const next = FORTRESS_LEVELS[index + 1] ?? null;
  return {
    trackerId: t.id,
    name: t.name,
    color: t.color,
    bricks,
    cracks,
    streak,
    level: { ...FORTRESS_LEVELS[index], index },
    next: next ? { ...next, bricksToGo: next.min - bricks } : null,
  };
}

/* ------------------------------ Money saved ------------------------------ */

function quitSaving(t, cfg, cleanDays) {
  return {
    trackerId: t.id,
    name: t.name,
    color: t.color,
    icon: t.icon,
    kind: cfg.kind,
    costPerDay: cfg.costPerDay,
    cleanDays,
    saved: round2(cleanDays * cfg.costPerDay),
  };
}

/* --------------------------------- All --------------------------------- */

export async function gamesFor(user) {
  const today = todayIn(user.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [{ rows: trackers }, activity] = await Promise.all([
    query('SELECT * FROM trackers WHERE user_id = $1 AND NOT archived ORDER BY sort_order, created_at', [user.id]),
    dailyActivity(user.id),
  ]);

  const piggyBanks = [];
  const fortresses = [];
  const quitSavings = [];

  for (const t of trackers) {
    const cfg = parseConfig(t.type, t.config);

    if (t.type === 'spending') {
      const { rows } = await query(
        `SELECT to_char(spent_on, 'YYYY-MM-DD') AS day, sum(amount)::float8 AS spent
           FROM expenses WHERE tracker_id = $1 AND spent_on >= $2 GROUP BY 1`,
        [t.id, monthStart],
      );
      const bank = piggyBank(t, cfg, new Map(rows.map((r) => [r.day, r.spent])), today, user.timezone);
      if (bank) piggyBanks.push(bank);
    }

    if (t.type === 'trading') {
      const { rows } = await query(
        `SELECT to_char(trade_date, 'YYYY-MM-DD') AS date, bool_or(is_rule_break) AS broken
           FROM trades WHERE tracker_id = $1 GROUP BY 1 ORDER BY 1`,
        [t.id],
      );
      fortresses.push(fortress(t, rows));
    }

    if (t.type === 'habit' && cfg.kind !== 'build' && cfg.costPerDay > 0) {
      const { rows } = await query('SELECT count(*)::int AS n FROM daily_entries WHERE tracker_id = $1 AND completed', [t.id]);
      quitSavings.push(quitSaving(t, cfg, rows[0].n));
    }
  }

  return {
    today,
    boss: weeklyBoss(trackers, activity, today),
    piggyBanks,
    fortresses,
    quitSavings,
  };
}
