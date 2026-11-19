import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, daysAgo, register, today } from './helpers.js';

test('XP, levels and badges come from real activity', async () => {
  const { token } = await register('Gamer');
  const h = (await api('POST', '/trackers', { type: 'habit', category: 'fitness', name: 'Run' }, token)).body.tracker.id;
  for (const n of [3, 2, 1]) await api('PUT', `/trackers/${h}/entries/${daysAgo(n)}`, { completed: true }, token);

  let r = await api('GET', '/dashboard', null, token);
  const g = r.body.game;
  assert.equal(g.xp, 3 * 10 + 3 * 50, '3 habit days + 3 badges');
  assert.ok(g.newlyUnlocked.some((a) => a.key === 'first_step') && g.newlyUnlocked.some((a) => a.key === 'streak_3'));
  const card = r.body.cards.find((c) => c.tracker.id === h);
  assert.ok(card.today.alerts.some((a) => /streak at risk/.test(a.title)), 'streak-at-risk alert');

  assert.equal((await api('POST', '/dashboard/achievements/seen', null, token)).status, 204);
  r = await api('GET', '/dashboard', null, token);
  assert.equal(r.body.game.newlyUnlocked.length, 0, 'each celebration shows once');
});

test('forest: trees grow from kept promises, wither from broken rules', async () => {
  const { token } = await register('Tree');
  let r = await api('GET', '/dashboard/forest', null, token);
  assert.equal(r.body.alive, 0);
  assert.equal(r.body.grid.length, 84);
  assert.equal(r.body.stage.name, 'Bare land');

  const walk = (await api('POST', '/trackers', { type: 'habit', name: 'Walk' }, token)).body.tracker.id;
  const read = (await api('POST', '/trackers', { type: 'habit', name: 'Read' }, token)).body.tracker.id;
  for (const n of [1, 2, 3]) await api('PUT', `/trackers/${walk}/entries/${daysAgo(n)}`, { completed: true }, token);
  await api('PUT', `/trackers/${read}/entries/${daysAgo(1)}`, { completed: true }, token);
  const trading = (await api('POST', '/trackers', { type: 'trading', name: 'Nifty', config: { tradingDays: [0, 1, 2, 3, 4, 5, 6], maxTradesPerDay: 1, dailyMaxLoss: 1000 } }, token)).body.tracker.id;
  await api('POST', `/trackers/${trading}/trades`, { tradeDate: daysAgo(5), pnl: -22000, tradeCount: 6, quick: true }, token);

  r = await api('GET', '/dashboard/forest', null, token);
  const day = Object.fromEntries(r.body.grid.map((d) => [d.date, d]));
  assert.equal(day[daysAgo(1)].tree, 2, 'two promises → tree');
  assert.equal(day[daysAgo(2)].tree, 1, 'one promise → sprout');
  assert.equal(day[daysAgo(5)].tree, -1, 'rule-breaking day withers');
  assert.equal(r.body.alive, 3);
  assert.equal(r.body.withered, 1);
  assert.equal(r.body.streak, 3, 'an empty today does not break the streak');
  assert.equal(r.body.stage.name, 'First sprout');
  assert.equal(r.body.next.treesToGo, 4);
  assert.equal(r.body.health, 75);
});

test('games: weekly boss, money saved, piggy bank and fortress', async () => {
  const { token } = await register('Arcade');
  let r = await api('GET', '/dashboard/games', null, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.boss.maxHp, 10, 'a new member faces a 10 HP boss');
  assert.equal(r.body.boss.hp, 10);
  assert.ok(r.body.boss.daysLeft >= 0 && r.body.boss.daysLeft <= 6);
  assert.deepEqual([r.body.piggyBanks.length, r.body.fortresses.length, r.body.quitSavings.length], [0, 0, 0]);

  const quit = (await api('POST', '/trackers', { type: 'habit', category: 'quit', name: 'No smoking', config: { kind: 'quit', costPerDay: 150 } }, token)).body.tracker.id;
  await api('PUT', `/trackers/${quit}/entries/${today}`, { completed: true }, token);
  await api('PUT', `/trackers/${quit}/entries/${daysAgo(1)}`, { completed: true }, token);
  await api('POST', '/trackers', { type: 'habit', name: 'Walk', config: { costPerDay: 99 } }, token); // build habit → no money game
  const spend = (await api('POST', '/trackers', { type: 'spending', name: 'Daily spend', config: { dailyLimit: 500 } }, token)).body.tracker.id;
  await api('POST', `/trackers/${spend}/expenses`, { amount: 200 }, token);
  const trade = (await api('POST', '/trackers', { type: 'trading', name: 'Nifty', config: { tradingDays: [0, 1, 2, 3, 4, 5, 6], maxTradesPerDay: 2, dailyMaxLoss: 1000, checklist: [] } }, token)).body.tracker.id;
  await api('POST', `/trackers/${trade}/trades`, { tradeDate: daysAgo(3), pnl: -5000, tradeCount: 5, quick: true }, token);
  await api('POST', `/trackers/${trade}/trades`, { tradeDate: daysAgo(2), pnl: 800 }, token);

  r = await api('GET', '/dashboard/games', null, token);
  const g = r.body;
  assert.deepEqual([g.quitSavings.length, g.quitSavings[0].cleanDays, g.quitSavings[0].saved], [1, 2, 300], 'money saved = clean days × cost');
  assert.equal(g.piggyBanks.length, 1);
  assert.ok(g.piggyBanks[0].saved >= 300, `piggy bank holds ${g.piggyBanks[0].saved}`);
  assert.equal(g.piggyBanks[0].daysOver, 0);
  const fort = g.fortresses[0];
  assert.deepEqual([fort.bricks, fort.cracks, fort.streak, fort.level.name, fort.next.bricksToGo], [1, 1, 1, 'Camp', 2]);
  assert.equal(g.boss.maxHp, 14 + 6, '2 habits × 7 days + 3 per trading / money tracker');
  assert.ok(g.boss.hp >= 0 && g.boss.hp <= g.boss.maxHp);
});
