/**
 * XP, levels and achievements.
 *
 * XP is *derived* from what the member actually did (check-ins, clean trades, journals, budget-kept
 * expenses, minus rule breaks), so it can never drift: undoing a check-in or deleting a trade
 * updates XP automatically. Points per action are admin settings (group "Game").
 */
import { query } from '../db/pool.js';

export const LEVEL_NAMES = [
  'Beginner', 'Committed', 'Consistent', 'Focused', 'Disciplined',
  'Relentless', 'Unbreakable', 'Iron Will', 'Master', 'Anchored',
];

/** Total XP needed to reach level n (n >= 1): 0, 100, 300, 600, 1000, 1500, ... */
export const xpForLevel = (n) => 50 * n * (n - 1);

export function levelInfo(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return {
    xp,
    level,
    levelName: LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length) - 1],
    levelStartXp: from,
    nextLevelXp: to,
    progress: Math.min(1, (xp - from) / (to - from)),
  };
}

/**
 * Achievement definitions. `check(stats)` decides if it's earned.
 * Icons are MaterialCommunityIcons names.
 */
export const ACHIEVEMENTS = [
  { key: 'first_step', title: 'First step', description: 'Create your first tracker', icon: 'flag-checkered', check: (s) => s.trackers >= 1 },
  { key: 'first_win', title: 'First win', description: 'Complete a habit for the first time', icon: 'check-decagram', check: (s) => s.habitDays >= 1 },
  { key: 'streak_3', title: 'Warming up', description: 'Reach a 3-day streak', icon: 'fire', check: (s) => s.bestStreak >= 3 },
  { key: 'streak_7', title: 'One week strong', description: 'Reach a 7-day streak', icon: 'fire', check: (s) => s.bestStreak >= 7 },
  { key: 'streak_30', title: 'Habit formed', description: 'Reach a 30-day streak', icon: 'fire-circle', check: (s) => s.bestStreak >= 30 },
  { key: 'streak_100', title: 'Unstoppable', description: 'Reach a 100-day streak', icon: 'crown', check: (s) => s.bestStreak >= 100 },
  { key: 'clean_trader_5', title: 'Clean hands', description: '5 trading days in a row without breaking a rule', icon: 'shield-check', check: (s) => s.bestCleanTrading >= 5 },
  { key: 'clean_trader_20', title: 'Professional', description: '20 trading days in a row without breaking a rule', icon: 'shield-star', check: (s) => s.bestCleanTrading >= 20 },
  { key: 'budget_7', title: 'Money minded', description: '7 days in a row within budget', icon: 'piggy-bank', check: (s) => s.bestBudgetStreak >= 7 },
  { key: 'journal_7', title: 'Self-aware', description: 'Write 7 journal entries', icon: 'notebook-check', check: (s) => s.journals >= 7 },
  { key: 'checkins_50', title: 'Fifty strong', description: 'Complete 50 habit days', icon: 'medal', check: (s) => s.habitDays >= 50 },
  { key: 'checkins_365', title: 'A year of you', description: 'Complete 365 habit days', icon: 'trophy', check: (s) => s.habitDays >= 365 },
  { key: 'all_rounder', title: 'All-rounder', description: 'Track 3 different areas of life', icon: 'palette', check: (s) => s.categories >= 3 },
  { key: 'honest', title: 'Honest with myself', description: 'Write down the reason when you break a rule', icon: 'handshake', check: (s) => s.reasonedBreaks >= 1 },
  { key: 'reviewer', title: 'Looking back', description: 'Complete your first weekly review', icon: 'calendar-check', check: (s) => s.reviews >= 1 },
  { key: 'ambassador', title: 'Ambassador', description: 'A friend joined with your invite', icon: 'account-heart', check: (s) => s.referrals >= 1 },
  { key: 'level_5', title: 'Disciplined', description: 'Reach level 5', icon: 'star-circle', check: (s) => s.level >= 5 },
  { key: 'level_10', title: 'Anchored', description: 'Reach level 10', icon: 'anchor', check: (s) => s.level >= 10 },
];

/** Raw counts for one member in a single round trip. */
async function loadCounts(userId) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*) FROM trackers WHERE user_id = $1 AND NOT archived) AS trackers,
       (SELECT count(DISTINCT category) FROM trackers WHERE user_id = $1 AND NOT archived) AS categories,
       (SELECT count(*) FROM daily_entries de JOIN trackers t ON t.id = de.tracker_id
          WHERE de.user_id = $1 AND de.completed AND t.type = 'habit') AS "habitDays",
       (SELECT count(*) FROM daily_entries de JOIN trackers t ON t.id = de.tracker_id
          WHERE de.user_id = $1 AND de.completed AND t.type = 'trading') AS journals,
       (SELECT count(*) FROM trades WHERE user_id = $1 AND NOT is_rule_break) AS "cleanTrades",
       (SELECT count(*) FROM expenses WHERE user_id = $1 AND NOT is_rule_break) AS "keptExpenses",
       (SELECT count(*) FROM rule_breaks WHERE user_id = $1) AS breaks,
       (SELECT count(*) FROM rule_breaks WHERE user_id = $1 AND reason IS NOT NULL AND reason <> '') AS "reasonedBreaks",
       (SELECT count(*) FROM member_achievements WHERE user_id = $1) AS achievements,
       (SELECT count(*) FROM weekly_reviews WHERE user_id = $1) AS reviews,
       -- friends count once they verify their email (no farming with fake accounts)
       (SELECT count(*) FROM members WHERE referred_by = $1 AND email_verified_at IS NOT NULL) AS referrals`,
    [userId],
  );
  return rows[0];
}

export function computeXp(c, s) {
  const xp =
    c.habitDays * s.xp_habit_day +
    c.journals * s.xp_journal +
    c.cleanTrades * s.xp_clean_trade +
    c.keptExpenses * s.xp_expense -
    c.breaks * s.xp_rule_break +
    c.achievements * s.xp_achievement +
    (Number(c.reviews) || 0) * s.xp_weekly_review +
    (Number(c.referrals) || 0) * s.xp_referral;
  return Math.max(0, xp);
}

/**
 * Compute XP/level, unlock any newly earned achievements, and return the game state.
 * `streaks` comes from the dashboard cards (already computed there).
 */
export async function gameState(userId, settings, streaks) {
  let counts = await loadCounts(userId);
  let info = levelInfo(computeXp(counts, settings));
  const stats = { ...counts, ...streaks, level: info.level };

  const { rows: owned } = await query('SELECT achievement, unlocked_at, seen FROM member_achievements WHERE user_id = $1', [userId]);
  const ownedMap = new Map(owned.map((r) => [r.achievement, r]));
  const earned = ACHIEVEMENTS.filter((a) => !ownedMap.has(a.key) && a.check(stats));
  if (earned.length) {
    for (const a of earned) {
      await query('INSERT INTO member_achievements (user_id, achievement) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, a.key]);
    }
    // Achievements give XP too, which may unlock level-based ones on the next visit
    counts = { ...counts, achievements: counts.achievements + earned.length };
    info = levelInfo(computeXp(counts, settings));
  }

  const { rows: now } = await query('SELECT achievement, unlocked_at, seen FROM member_achievements WHERE user_id = $1', [userId]);
  const unlocked = new Map(now.map((r) => [r.achievement, r]));
  const achievements = ACHIEVEMENTS.map(({ key, title, description, icon }) => ({
    key,
    title,
    description,
    icon,
    unlocked: unlocked.has(key),
    unlockedAt: unlocked.get(key)?.unlocked_at ?? null,
  }));

  return {
    ...info,
    achievements,
    unlockedCount: unlocked.size,
    // Shown as a celebration in the app, then acknowledged via POST /api/me/achievements/seen
    newlyUnlocked: achievements.filter((a) => a.unlocked && unlocked.get(a.key)?.seen === false),
    points: {
      habitDay: settings.xp_habit_day,
      cleanTrade: settings.xp_clean_trade,
      journal: settings.xp_journal,
      expense: settings.xp_expense,
      ruleBreak: -settings.xp_rule_break,
      weeklyReview: settings.xp_weekly_review,
      friendJoined: settings.xp_referral,
    },
  };
}

export async function markAchievementsSeen(userId) {
  await query('UPDATE member_achievements SET seen = true WHERE user_id = $1 AND NOT seen', [userId]);
}
