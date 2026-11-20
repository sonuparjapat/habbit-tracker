/**
 * The Today screen and the games.
 *
 *   GET  /api/dashboard                    every tracker's card for today + day score + XP / level
 *   GET  /api/dashboard/forest             "Your forest"
 *   GET  /api/dashboard/games              weekly boss, piggy banks, fortresses, money saved
 *   GET  /api/dashboard/review             the weekly review (?week=YYYY-MM-DD, a Monday; default: the week just finished)
 *   PUT  /api/dashboard/review             save my answers { weekStart, wentWell?, hard?, nextFocus? }
 *   POST /api/dashboard/achievements/seen  mark new badges as celebrated
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { HttpError, parse } from '../middleware/errors.js';
import { forestFor } from '../services/forest.js';
import { gamesFor } from '../services/games.js';
import { gameState, markAchievementsSeen } from '../services/gamification.js';
import { getSettings } from '../services/settings.js';
import { serializeTracker, todayFor } from '../services/trackers.js';
import { defaultReviewWeek, saveReviewAnswers, weeklyReview, assertReviewableWeek } from '../services/weeklyReview.js';
import { todayIn } from '../utils/date.js';
import { dateStr } from '../utils/validation.js';

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

/** GET /api/dashboard/review — how the week went + the member's saved answers. */
dashboardRouter.get('/review', async (req, res) => {
  const settings = await getSettings();
  if (!settings.weekly_review_enabled) throw new HttpError(404, 'Weekly reviews are switched off right now.', 'DISABLED');
  const week = req.query.week ? parse(dateStr, req.query.week) : defaultReviewWeek(todayIn(req.user.timezone));
  res.json(await weeklyReview(req.user, week));
});

const reviewSchema = z.object({
  weekStart: dateStr,
  wentWell: z.string().trim().max(1000).optional(),
  hard: z.string().trim().max(1000).optional(),
  nextFocus: z.string().trim().max(1000).optional(),
});

/** PUT /api/dashboard/review — save the three answers (each one optional; earlier answers are kept). */
dashboardRouter.put('/review', async (req, res) => {
  const { weekStart, ...answers } = parse(reviewSchema, req.body);
  assertReviewableWeek(weekStart, todayIn(req.user.timezone));
  if (!Object.values(answers).some(Boolean)) throw new HttpError(400, 'Write at least one answer', 'VALIDATION');
  res.json({ weekStart, answers: await saveReviewAnswers(req.user.id, weekStart, answers) });
});

/** POST /api/dashboard/achievements/seen — the app calls this after showing the "achievement unlocked" celebration. */
dashboardRouter.post('/achievements/seen', async (req, res) => {
  await markAchievementsSeen(req.user.id);
  res.status(204).end();
});
