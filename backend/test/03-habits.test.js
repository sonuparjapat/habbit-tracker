import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, daysAgo, register, today } from './helpers.js';

test('habits: build, quit and limit habits', async () => {
  const { token } = await register('Habit');

  // Limit habit: under the limit = a good day
  let r = await api('POST', '/trackers', { type: 'habit', category: 'quit', name: 'Cigarettes', config: { kind: 'limit', goalType: 'count', target: 5, unit: 'cigs' } }, token);
  assert.equal(r.status, 201);
  const limit = r.body.tracker.id;
  r = await api('PUT', `/trackers/${limit}/entries/${today}`, { value: 3 }, token);
  assert.equal(r.body.entry.completed, true, 'under the limit = done');
  r = await api('PUT', `/trackers/${limit}/entries/${today}`, { value: 7 }, token);
  assert.equal(r.body.entry.completed, false, 'over the limit = not done');
  r = await api('GET', `/trackers/${limit}/today`, null, token);
  assert.equal(r.body.overLimit, true);
  r = await api('PUT', `/trackers/${limit}/entries/${today}`, { value: 0 }, token);
  assert.equal(r.body.entry.completed, true, '"None today" (0) is a clean day');
  r = await api('GET', `/trackers/${limit}/today`, null, token);
  assert.equal(r.body.currentStreak, 1);

  // Quit habit: check in, then undo
  r = await api('POST', '/trackers', { type: 'habit', category: 'quit', name: 'No smoking', config: { kind: 'quit', costPerDay: 150 } }, token);
  assert.equal(r.body.tracker.config.costPerDay, 150, 'cost per bad day saved');
  const quit = r.body.tracker.id;
  r = await api('PUT', `/trackers/${quit}/entries/${today}`, { completed: true }, token);
  assert.equal(r.body.entry.completed, true);
  r = await api('DELETE', `/trackers/${quit}/entries/${today}`, null, token);
  assert.equal(r.status, 204);

  // Can't log the future, can't use bad dates
  r = await api('PUT', `/trackers/${quit}/entries/2999-01-01`, { completed: true }, token);
  assert.equal(r.status, 400);
  r = await api('PUT', `/trackers/${quit}/entries/yesterday`, { completed: true }, token);
  assert.equal(r.status, 400);
});

test('habits: streaks, back-filled days and the lost-streak alert', async () => {
  const { token } = await register('Streak');
  const h = (await api('POST', '/trackers', { type: 'habit', name: 'Read' }, token)).body.tracker.id;
  for (const n of [5, 4, 3, 2]) await api('PUT', `/trackers/${h}/entries/${daysAgo(n)}`, { completed: true }, token);
  const r = await api('GET', `/trackers/${h}/today`, null, token);
  assert.equal(r.body.lostStreak, 4, 'back-filled days count towards the streak');
  assert.ok(r.body.alerts.some((a) => /lost a 4-day streak/.test(a.title)));

  const stats = await api('GET', `/trackers/${h}/stats?period=30d`, null, token);
  assert.equal(stats.status, 200);
});

test('trackers: edit, archive, delete — and nobody else can see them', async () => {
  const me = await register('Owner');
  const other = await register('Other');
  const id = (await api('POST', '/trackers', { type: 'habit', name: 'Walk' }, me.token)).body.tracker.id;

  let r = await api('PATCH', `/trackers/${id}`, { name: 'Morning walk', config: { target: 2, goalType: 'count' } }, me.token);
  assert.equal(r.body.tracker.name, 'Morning walk');
  assert.equal(r.body.tracker.config.target, 2);
  r = await api('PATCH', `/trackers/${id}`, { config: { kind: 'nope' } }, me.token);
  assert.equal(r.status, 400, 'invalid settings rejected');

  // Another member gets "not found" — not even a hint that it exists
  for (const [method, path] of [['GET', `/trackers/${id}`], ['PATCH', `/trackers/${id}`], ['DELETE', `/trackers/${id}`], ['GET', `/trackers/${id}/stats`]]) {
    r = await api(method, path, method === 'PATCH' ? { name: 'x' } : undefined, other.token);
    assert.equal(r.status, 404, `${method} ${path} by another member`);
  }
  r = await api('GET', '/trackers', null, other.token);
  assert.equal(r.body.trackers.length, 0);

  r = await api('PATCH', `/trackers/${id}`, { archived: true }, me.token);
  assert.equal((await api('GET', '/trackers', null, me.token)).body.trackers.length, 0, 'archived trackers are hidden');
  assert.equal((await api('GET', '/trackers?archived=true', null, me.token)).body.trackers.length, 1);

  r = await api('DELETE', `/trackers/${id}`, null, me.token);
  assert.equal(r.status, 204);
  assert.equal((await api('GET', `/trackers/${id}`, null, me.token)).status, 404);
});

test('money: budgets, no-spend days and editing expenses', async () => {
  const { token } = await register('Spender');
  const yesterdayWeekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  let r = await api('POST', '/trackers', { type: 'spending', category: 'money', name: 'Budget', config: { dailyLimit: 500, monthlyLimit: 3000, noSpendDays: [yesterdayWeekday] } }, token);
  assert.equal(r.status, 201);
  const id = r.body.tracker.id;

  r = await api('POST', `/trackers/${id}/expenses`, { amount: 300, category: 'Food' }, token);
  assert.equal(r.status, 201);
  assert.equal(r.body.breaks.length, 0, 'under budget');
  r = await api('POST', `/trackers/${id}/expenses`, { amount: 400, category: 'Shopping', note: 'shoes' }, token);
  assert.ok(r.body.breaks.some((b) => b.rule === 'over_daily' && b.label === 'Over daily budget'));
  r = await api('POST', `/trackers/${id}/expenses`, { amount: 0 }, token);
  assert.equal(r.status, 400, 'zero expense rejected');
  r = await api('POST', `/trackers/${id}/expenses`, { amount: 50, spentOn: daysAgo(1) }, token);
  assert.ok(r.body.breaks.some((b) => b.rule === 'no_spend_day'), 'spending on a no-spend day is flagged');

  r = await api('GET', `/trackers/${id}/today`, null, token);
  assert.equal(r.body.status.spentToday, 700);
  assert.equal(r.body.status.overDaily, true);
  assert.ok(r.body.alerts.some((a) => /Daily budget/.test(a.title)));

  r = await api('GET', `/trackers/${id}/stats?period=month`, null, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.byCategory[0].category, 'Shopping');

  // Editing an expense re-judges the month
  r = await api('GET', `/trackers/${id}/expenses?period=month`, null, token);
  const shoes = r.body.expenses.find((e) => e.note === 'shoes');
  r = await api('PATCH', `/expenses/${shoes.id}`, { amount: 100 }, token);
  assert.equal(r.status, 200);
  r = await api('GET', `/trackers/${id}/today`, null, token);
  assert.equal(r.body.status.overDaily, false, 'edit clears the over-budget break');

  // Trading-only routes refuse a money tracker
  r = await api('GET', `/trackers/${id}/trades`, null, token);
  assert.equal(r.status, 400);
});
