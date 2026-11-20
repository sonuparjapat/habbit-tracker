/**
 * Growth & retention: streak shields, starter packs, invites, weekly review.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { habitStreaks } from '../src/services/habitStats.js';
import { api, daysAgo, lastCode, login, register, settle, today, weekday } from './helpers.js';

const EVERY_DAY = { days: [0, 1, 2, 3, 4, 5, 6] };
const dates = (...ns) => new Set(ns.map(daysAgo));
const thisMonday = (() => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
})();

test('streak shields: earned every 7 days, used on a missed day', () => {
  const shields = { every: 7, max: 3 };
  const start = daysAgo(20);
  // Done 20..11 (10 days), missed day 10, done 9..1, today not yet
  const done = dates(20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 9, 8, 7, 6, 5, 4, 3, 2, 1);
  const off = habitStreaks(EVERY_DAY, done, start, today);
  assert.equal(off.current, 9, 'without shields the miss breaks the streak');
  assert.equal(off.best, 10);
  const on = habitStreaks(EVERY_DAY, done, start, today, shields);
  assert.equal(on.current, 19, 'the shield earned on day 7 saves the streak');
  assert.deepEqual(on.shieldedDays, [daysAgo(10)]);
  assert.equal(on.shields, 1, 'earned 2, used 1');

  // Two misses in a row with only one shield → the second one breaks it
  const two = habitStreaks(EVERY_DAY, dates(20, 19, 18, 17, 16, 15, 14, 11, 10), start, today, shields);
  assert.deepEqual(two.shieldedDays, [daysAgo(13)], 'the only shield covers the first miss');
  assert.equal(two.best, 7);

  // Never more than the maximum
  const sixty = new Set(Array.from({ length: 60 }, (_, i) => daysAgo(i + 1)));
  assert.equal(habitStreaks(EVERY_DAY, sixty, daysAgo(60), today, shields).shields, 3);

  // "Lost streak" only when no shield covered the miss
  assert.equal(habitStreaks(EVERY_DAY, dates(5, 4, 3, 2), daysAgo(5), today, shields).lost, 4);
});

test('streak shields in the app: a shield saves yesterday and says so', async () => {
  const { token } = await register('Shield');
  const h = (await api('POST', '/trackers', { type: 'habit', name: 'Walk' }, token)).body.tracker.id;
  for (const n of [9, 8, 7, 6, 5, 4, 3, 2]) await api('PUT', `/trackers/${h}/entries/${daysAgo(n)}`, { completed: true }, token);
  // Yesterday missed
  let r = await api('GET', `/trackers/${h}/today`, null, token);
  assert.equal(r.body.currentStreak, 8, 'the shield earned on day 7 covered yesterday');
  assert.equal(r.body.shields, 0);
  assert.ok(r.body.alerts.some((a) => /shield saved/.test(a.title)));
  assert.ok(!r.body.alerts.some((a) => /lost a/.test(a.title)));

  // Admin switches shields off → the streak is broken again
  const admin = (await login('admin@test.local', 'adminpass123')).token;
  await api('PUT', '/admin/settings', { values: { streak_shields_enabled: false } }, admin);
  r = await api('GET', `/trackers/${h}/today`, null, token);
  assert.equal(r.body.currentStreak, 0);
  assert.equal(r.body.lostStreak, 8);
  await api('DELETE', '/admin/settings/streak_shields_enabled', null, admin);
});

test('starter packs: public list, one tap creates trackers, no duplicates, admin manages', async () => {
  let r = await api('GET', '/starter-packs');
  assert.equal(r.status, 200);
  const morning = r.body.packs.find((p) => p.slug === 'morning-routine');
  assert.equal(morning?.trackers.length, 4, 'built-in packs are seeded');

  const { token } = await register('Packer');
  r = await api('POST', '/trackers/from-pack', { slug: 'morning-routine' }, token);
  assert.equal(r.status, 201);
  assert.equal(r.body.trackers.length, 4);
  assert.ok(r.body.trackers.every((t) => Array.isArray(t.config.days)), 'full configs with defaults');
  r = await api('POST', '/trackers/from-pack', { slug: 'morning-routine' }, token);
  assert.equal(r.body.error.code, 'NOTHING_TO_ADD', 'no duplicates');
  r = await api('POST', '/trackers/from-pack', { slug: 'calm-mind' }, token);
  assert.equal(r.body.trackers.length, 2, 'only the new ones (gratitude, sleep)');
  assert.equal(r.body.skipped, 2);
  assert.equal((await api('POST', '/trackers/from-pack', { slug: 'nope' }, token)).status, 404);

  // Admin: validate, create, hide, delete
  const staff = (await login('staff@test.local', 'adminpass123')).token;
  r = await api('POST', '/admin/starter-packs', { slug: 'night-owl', name: 'Night owl fix', emoji: '🦉', templateSlugs: ['sleep', 'nope'] }, staff);
  assert.equal(r.status, 400, 'unknown templates refused');
  r = await api('POST', '/admin/starter-packs', { slug: 'night-owl', name: 'Night owl fix', emoji: '🦉', templateSlugs: ['sleep', 'wake-early'] }, staff);
  assert.equal(r.status, 201);
  const id = r.body.pack.id;
  assert.ok((await api('GET', '/starter-packs')).body.packs.some((p) => p.slug === 'night-owl'));
  await api('PATCH', `/admin/starter-packs/${id}`, { active: false }, staff);
  assert.ok(!(await api('GET', '/starter-packs')).body.packs.some((p) => p.slug === 'night-owl'), 'hidden packs are not public');
  assert.equal((await api('DELETE', `/admin/starter-packs/${id}`, null, staff)).status, 204);
  r = await api('GET', '/admin/starter-packs', null, staff);
  assert.ok(!r.body.packs.some((p) => p.slug === 'night-owl'));
  // Deleting a built-in pack only hides it
  const builtIn = r.body.packs.find((p) => p.slug === 'digital-detox');
  await api('DELETE', `/admin/starter-packs/${builtIn.id}`, null, staff);
  r = await api('GET', '/admin/starter-packs', null, staff);
  assert.equal(r.body.packs.find((p) => p.slug === 'digital-detox').active, false);
  await api('PATCH', `/admin/starter-packs/${builtIn.id}`, { active: true }, staff);

  // Trading switched off → trading templates disappear from packs
  const admin = (await login('admin@test.local', 'adminpass123')).token;
  await api('PUT', '/admin/settings', { values: { feature_trading: false } }, admin);
  r = await api('GET', '/starter-packs');
  assert.ok(!r.body.packs.find((p) => p.slug === 'disciplined-trader').trackers.some((t) => t.type === 'trading'));
  await api('DELETE', '/admin/settings/feature_trading', null, admin);
});

test('invites: code, sign-up with a code, reward only after the friend verifies', async () => {
  const inviter = await register('Inviter');
  let r = await api('GET', '/auth/me/invites', null, inviter.token);
  assert.match(r.body.code, /^[A-Z2-9]{8}$/);
  assert.equal(r.body.joined, 0);
  const code = r.body.code;
  const xpBefore = (await api('GET', '/dashboard', null, inviter.token)).body.game.xp;

  r = await api('POST', '/auth/register', { name: 'Typo', email: 'typo@t.local', password: 'Steady-Habit-42', acceptTerms: true, inviteCode: 'WRONG123' });
  assert.equal(r.body.error.code, 'INVITE_INVALID');
  const friend = await register('Friend', { inviteCode: code.toLowerCase() });
  r = await api('GET', '/auth/me/invites', null, inviter.token);
  assert.deepEqual([r.body.joined, r.body.pending], [0, 1], 'counts only after the friend verifies');

  await settle();
  await api('POST', '/auth/verify-email', { code: lastCode(friend.email) }, friend.token);
  r = await api('GET', '/auth/me/invites', null, inviter.token);
  assert.equal(r.body.joined, 1);
  const game = (await api('GET', '/dashboard', null, inviter.token)).body.game;
  assert.ok(game.xp >= xpBefore + 100, `XP for the friend (${xpBefore} → ${game.xp})`);
  assert.ok(game.newlyUnlocked.some((a) => a.key === 'ambassador'));

  // Staff accounts (made by create-admin) get a code on first use
  const staff = (await login('staff@test.local', 'adminpass123')).token;
  assert.match((await api('GET', '/auth/me/invites', null, staff)).body.code, /^[A-Z2-9]{8}$/);
});

test('weekly review: numbers from the logs, answers saved, XP + badge', async () => {
  const { token } = await register('Reviewer');
  const h = (await api('POST', '/trackers', { type: 'habit', name: 'Read' }, token)).body.tracker.id;
  await api('PUT', `/trackers/${h}/entries/${today}`, { completed: true }, token);

  let r = await api('GET', '/dashboard/review', null, token);
  assert.equal(r.status, 200);
  assert.equal(new Date(`${r.body.weekStart}T00:00:00Z`).getUTCDay(), 1, 'weeks start on Monday');
  if (weekday === 0) assert.equal(r.body.weekStart, thisMonday, 'on Sunday the review is about this week');
  else assert.equal(r.body.habits.planned, 0, 'tracker made this week → nothing planned last week');

  r = await api('GET', `/dashboard/review?week=${thisMonday}`, null, token);
  assert.equal(r.body.habits.done, 1);
  assert.ok(r.body.items.some((i) => i.name === 'Read' && i.done === 1));
  assert.equal(r.body.forest.grown, 1);
  assert.equal(r.body.bestDay.date, today);

  // Validation
  const notMonday = weekday === 1 ? daysAgo(1) : today;
  assert.equal((await api('GET', `/dashboard/review?week=${notMonday}`, null, token)).status, 400, 'must be a Monday');
  assert.equal((await api('GET', '/dashboard/review?week=2999-01-07', null, token)).status, 400, 'future weeks refused');
  assert.equal((await api('PUT', '/dashboard/review', { weekStart: thisMonday }, token)).status, 400, 'needs an answer');

  // Answers are merged
  await api('PUT', '/dashboard/review', { weekStart: thisMonday, wentWell: 'Read every night' }, token);
  r = await api('PUT', '/dashboard/review', { weekStart: thisMonday, nextFocus: 'Sleep earlier' }, token);
  assert.deepEqual(r.body.answers, { wentWell: 'Read every night', nextFocus: 'Sleep earlier' });
  assert.equal((await api('GET', `/dashboard/review?week=${thisMonday}`, null, token)).body.answers.wentWell, 'Read every night');
  const game = (await api('GET', '/dashboard', null, token)).body.game;
  assert.ok(game.newlyUnlocked.some((a) => a.key === 'reviewer'));
  assert.equal(game.points.weeklyReview, 20);

  // Admin switch
  const admin = (await login('admin@test.local', 'adminpass123')).token;
  await api('PUT', '/admin/settings', { values: { weekly_review_enabled: false } }, admin);
  assert.equal((await api('GET', '/dashboard/review', null, token)).status, 404);
  await api('DELETE', '/admin/settings/weekly_review_enabled', null, admin);
});
