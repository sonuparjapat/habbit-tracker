/**
 * The Today screen and the games.
 *
 *   GET  /api/dashboard                    every tracker's card for today + day score + XP / level
 *   GET  /api/dashboard/forest             "Your forest"
 *   GET  /api/dashboard/games              weekly boss, piggy banks, fortresses, money saved
 *   POST /api/dashboard/achievements/seen  mark new badges as celebrated
 */
import { Router } from 'express';
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { forestFor } from '../services/forest.js';
import { gamesFor } from '../services/games.js';
import { gameState, markAchievementsSeen } from '../services/gamification.js';
import { getSettings } from '../services/settings.js';
import { serializeTracker, todayFor } from '../services/trackers.js';
import { todayIn } from '../utils/date.js';

export const dashboardRouter = Router();

/** GET /api/dashboard — everything the Today screen needs, in one request. */
dashboardRouter.get('/', async (req, res) => {
  const user = req.user;
  const [settings, { rows }] = await Promise.all([
    getSettings(),
    query('SELECT * FROM trackers WHERE user_id = $1 AND NOT archived ORDER BY sort_order, created_at', [user.id]),
  ]);
  const cards = await Promise.all(rows.map(async (t) => ({ tracker: serializeTracker(t), today: await todayFor(t, user) })));

  const habits = cards.filter((c) => c.tracker.type === 'habit');
  const due = habits.filter((h) => h.today.scheduledToday);
  const done = due.filter((h) => h.today.completedToday);
  const breaksToday = cards.reduce((s, c) => s + (c.today.breaksToday ?? 0), 0);
  const spendingOver = cards.filter(
    (c) => c.tracker.type === 'spending' && (c.today.status.overDaily || (c.today.status.noSpendDay && c.today.status.spentToday > 0)),
  ).length;

  // Day score: share of habits done, minus a penalty per limit broken today
  const habitPart = due.length ? done.length / due.length : 1;
  const dayScore = Math.max(0, Math.round(habitPart * 100 - (breaksToday + spendingOver) * 25));

  const max = (list) => list.reduce((m, v) => Math.max(m, v ?? 0), 0);
  const game = settings.feature_gamification
    ? await gameState(user.id, settings, {
        bestStreak: max(habits.map((h) => h.today.bestStreak)),
        bestCleanTrading: max(cards.filter((c) => c.tracker.type === 'trading').map((c) => c.today.streaks.bestClean)),
        bestBudgetStreak: max(cards.filter((c) => c.tracker.type === 'spending').map((c) => c.today.streak)),
      })
    : null;

  res.json({
    date: todayIn(user.timezone),
    user: { name: user.name, currency: user.currency, emailVerified: user.emailVerified },
    summary: { habitsDue: due.length, habitsDone: done.length, ruleBreaksToday: breaksToday + spendingOver, dayScore },
    cards,
    game,
  });
});

/** Games can be switched off by the admin (App settings → Features → Gamification). */
async function requireGames() {
  const settings = await getSettings();
  if (!settings.feature_gamification) throw new HttpError(404, 'Games are switched off right now.', 'DISABLED');
}

/** GET /api/dashboard/forest — "Your forest": a tree for every day you kept your promises. */
dashboardRouter.get('/forest', async (req, res) => {
  await requireGames();
  res.json(await forestFor(req.user));
});

/** GET /api/dashboard/games — weekly boss, piggy banks, fortresses and money saved. */
dashboardRouter.get('/games', async (req, res) => {
  await requireGames();
  res.json(await gamesFor(req.user));
});

/** POST /api/dashboard/achievements/seen — the app calls this after showing the "achievement unlocked" celebration. */
dashboardRouter.post('/achievements/seen', async (req, res) => {
  await markAchievementsSeen(req.user.id);
  res.status(204).end();
});
