import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, daysAgo, register, today, weekday } from './helpers.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const rulesOf = (breaks) => breaks.map((b) => b.rule).sort();

test('trading: limits, the locked day, overrides and editing', async () => {
  const { token } = await register('Trader');
  let r = await api('POST', '/trackers', {
    type: 'trading', category: 'trading', name: 'Crypto plan',
    config: { market: 'crypto', instrument: 'BTC', maxTradesPerDay: 1, dailyProfitTarget: 1000, dailyMaxLoss: 1000, tradingDays: ALL_DAYS },
  }, token);
  assert.equal(r.status, 201);
  assert.equal(r.body.tracker.config.market, 'crypto');
  const id = r.body.tracker.id;
  const checklist = r.body.tracker.config.checklist;

  r = await api('POST', '/trackers', { type: 'trading', name: 'bad', config: { market: 'moon' } }, token);
  assert.equal(r.status, 400, 'invalid market rejected');

  // A clean day, then an overtrading day
  r = await api('POST', `/trackers/${id}/trades`, { tradeDate: daysAgo(3), pnl: 1200, checklistDone: checklist }, token);
  assert.deepEqual(r.body.breaks, [], 'a trade inside the plan breaks nothing');
  r = await api('POST', `/trackers/${id}/trades`, { tradeDate: daysAgo(3), pnl: -2500, checklistDone: [], emotionBefore: 'overconfident' }, token);
  assert.deepEqual(rulesOf(r.body.breaks), ['after_target', 'checklist', 'max_loss', 'max_trades'].sort());

  // Today: target hit → day locked
  r = await api('POST', `/trackers/${id}/trades`, { pnl: 1300, checklistDone: checklist }, token);
  assert.equal(r.body.status.locked, true);
  r = await api('POST', `/trackers/${id}/trades`, { pnl: 100 }, token);
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'DAY_LOCKED');
  r = await api('POST', `/trackers/${id}/trades`, { pnl: 100, override: true, breakReason: 'short' }, token);
  assert.equal(r.status, 400, 'an override needs a real reason');
  assert.equal(r.body.error.code, 'REASON_REQUIRED');
  r = await api('POST', `/trackers/${id}/trades`, { pnl: -400, override: true, breakReason: 'I wanted more today', checklistDone: checklist }, token);
  assert.equal(r.status, 201);
  assert.deepEqual(rulesOf(r.body.breaks), ['after_target', 'max_trades']);
  assert.equal(r.body.breaks[0].reason, 'I wanted more today');

  // Can't trade in the future
  r = await api('POST', `/trackers/${id}/trades`, { tradeDate: '2999-01-01', pnl: 1 }, token);
  assert.equal(r.status, 400);

  // Editing a trade re-judges the day and keeps the reason written
  r = await api('GET', `/trackers/${id}/trades?period=30d`, null, token);
  const bigLoss = r.body.trades.find((t) => Number(t.pnl) === -2500);
  r = await api('PATCH', `/trades/${bigLoss.id}`, { pnl: -10, breakReason: 'greed' }, token);
  assert.equal(r.status, 200);
  r = await api('GET', `/trackers/${id}/rule-breaks?period=30d`, null, token);
  assert.ok(!r.body.breaks.some((b) => b.rule === 'max_loss'), 'max_loss gone after the edit');
  assert.ok(r.body.breaks.some((b) => b.reason === 'greed'));

  // Reports
  r = await api('GET', `/trackers/${id}/stats?period=30d`, null, token);
  assert.equal(r.status, 200);
  assert.ok(r.body.insights.some((i) => /target was enough/i.test(i.title)));
  // One bad day after a winning run is not yet a pattern (needs 2+ days) — no overconfidence warning
  assert.ok(!r.body.insights.some((i) => /overconfident/i.test(i.title)));
});

test('trading: day off locks the day', async () => {
  const { token } = await register('Rest');
  const id = (await api('POST', '/trackers', { type: 'trading', name: 'Weekday only', config: { tradingDays: [(weekday + 1) % 7], maxTradesPerDay: 3 } }, token)).body.tracker.id;
  let r = await api('GET', `/trackers/${id}/status`, null, token);
  assert.equal(r.body.status.isTradingDay, false);
  assert.ok(r.body.status.lockReasons.some((x) => x.rule === 'off_day'));
  r = await api('GET', `/trackers/${id}/today`, null, token);
  assert.ok(r.body.alerts.some((a) => a.title === 'Day off'));
  r = await api('POST', `/trackers/${id}/trades`, { pnl: 100 }, token);
  assert.equal(r.status, 409);
  r = await api('POST', `/trackers/${id}/trades`, { pnl: 100, override: true, breakReason: 'Saw a setup I could not ignore' }, token);
  assert.ok(r.body.breaks.some((b) => b.rule === 'off_day' && b.label === 'Traded on a day off'));
});

test('trading protection: quick day log, cool-off, tilt, per-trade and weekly limits', async () => {
  const { token } = await register('Protect');
  const cfg = { tradingDays: ALL_DAYS, maxTradesPerDay: 3, dailyMaxLoss: 5000, coolOffLoss: 5000, coolOffDays: 1, weeklyMaxLoss: 8000, maxLossPerTrade: 2000, tiltLosses: 2, tiltPauseMinutes: 30 };
  let r = await api('POST', '/trackers', { type: 'trading', category: 'trading', name: 'Nifty', config: cfg }, token);
  assert.equal(r.body.tracker.config.coolOffLoss, 5000);
  const id = r.body.tracker.id;
  r = await api('POST', '/trackers', { type: 'trading', name: 'Bad', config: { coolOffDays: 99 } }, token);
  assert.equal(r.status, 400, 'invalid cool-off days rejected');

  // Yesterday: the bad day, logged quickly after the fact
  r = await api('POST', `/trackers/${id}/trades`, { tradeDate: daysAgo(1), pnl: -22000, tradeCount: 6, quick: true, emotionBefore: 'revenge' }, token);
  assert.equal(r.status, 201);
  const rules = rulesOf(r.body.breaks);
  assert.ok(rules.includes('max_trades') && rules.includes('max_loss'), `judged honestly: ${rules}`);
  assert.ok(!rules.includes('checklist') && !rules.includes('big_loss'), 'a quick log is not judged per trade');
  assert.equal(r.body.status.coolOffNext, today, 'a big loss starts a cool-off');
  const yesterdayTrade = r.body.tradeId;

  // Today: cool-off
  r = await api('GET', `/trackers/${id}/status`, null, token);
  assert.ok(r.body.status.coolOff && r.body.status.lockReasons.some((x) => x.rule === 'cool_off'));
  r = await api('GET', `/trackers/${id}/today`, null, token);
  assert.ok(r.body.alerts.some((a) => /Cool-off/.test(a.title)));
  r = await api('POST', `/trackers/${id}/trades`, { pnl: 500, checklistDone: [] }, token);
  assert.equal(r.status, 409, 'normal trade blocked during cool-off');
  r = await api('POST', `/trackers/${id}/trades`, { pnl: -1000, quick: true }, token);
  assert.ok(r.body.breaks.some((b) => b.rule === 'cool_off'), 'quick log during cool-off is a break');
  const todayQuick = r.body.tradeId;

  // Deleting yesterday re-judges today
  assert.equal((await api('DELETE', `/trades/${yesterdayTrade}`, null, token)).status, 204);
  r = await api('GET', `/trackers/${id}/rule-breaks?period=30d`, null, token);
  assert.ok(!r.body.breaks.some((b) => b.rule === 'cool_off'), 'cool-off break removed');
  await api('DELETE', `/trades/${todayQuick}`, null, token);

  // Tilt: two losses in a row → pause
  const tilt = (await api('POST', '/trackers', { type: 'trading', name: 'Tilt', config: { ...cfg, coolOffLoss: 0, weeklyMaxLoss: 0, checklist: [] } }, token)).body.tracker.id;
  await api('POST', `/trackers/${tilt}/trades`, { pnl: -500 }, token);
  r = await api('POST', `/trackers/${tilt}/trades`, { pnl: -700 }, token);
  assert.ok(r.body.status.tiltUntil && r.body.status.locked);
  assert.equal((await api('POST', `/trackers/${tilt}/trades`, { pnl: 300 }, token)).status, 409);
  r = await api('POST', `/trackers/${tilt}/trades`, { pnl: 300, override: true, breakReason: 'I am sure this one is different' }, token);
  assert.ok(r.body.breaks.some((b) => b.rule === 'tilt'));

  // Per-trade loss limit
  const size = (await api('POST', '/trackers', { type: 'trading', name: 'Size', config: { ...cfg, coolOffLoss: 0, checklist: [] } }, token)).body.tracker.id;
  r = await api('POST', `/trackers/${size}/trades`, { pnl: -3000 }, token);
  assert.ok(r.body.breaks.some((b) => b.rule === 'big_loss'));

  // Weekly limit (only testable when yesterday is in the same week, i.e. not on Monday)
  if (weekday !== 1) {
    const weekly = (await api('POST', '/trackers', { type: 'trading', name: 'Weekly', config: { ...cfg, coolOffLoss: 0, maxLossPerTrade: 0, dailyMaxLoss: 0, tiltLosses: 0, checklist: [] } }, token)).body.tracker.id;
    await api('POST', `/trackers/${weekly}/trades`, { tradeDate: daysAgo(1), pnl: -9000 }, token);
    r = await api('GET', `/trackers/${weekly}/status`, null, token);
    assert.ok(r.body.status.weeklyLimitHit && r.body.status.lockReasons.some((x) => x.rule === 'after_weekly_loss'));
  }

  // A quick log counts as several trades in reports
  const counts = (await api('POST', '/trackers', { type: 'trading', name: 'Counts', config: { ...cfg, coolOffLoss: 0, checklist: [] } }, token)).body.tracker.id;
  await api('POST', `/trackers/${counts}/trades`, { tradeDate: daysAgo(2), pnl: 4000, tradeCount: 4, quick: true }, token);
  r = await api('GET', `/trackers/${counts}/stats?period=30d`, null, token);
  assert.equal(r.body.summary.trades, 4);
});
