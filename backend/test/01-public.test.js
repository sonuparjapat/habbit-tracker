import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, captured } from './helpers.js';

test('public: lists, templates and app config', async () => {
  let r = await api('GET', '/meta');
  assert.equal(r.status, 200);
  assert.equal(r.body.categories.length, 7);

  r = await api('GET', '/templates');
  assert.equal(r.status, 200);
  assert.ok(r.body.templates.length >= 20, `templates seeded (${r.body.templates.length})`);
  assert.ok(!JSON.stringify(r.body.templates).includes('NIFTY'), 'no market-specific defaults');

  r = await api('GET', '/config');
  assert.equal(r.status, 200);
  assert.equal(r.body.settings.signups_enabled, true);
  assert.ok(Array.isArray(r.body.settings.daily_quotes));
  assert.equal(r.body.settings.default_theme, 'dark');
  assert.equal(r.body.settings.hindi_enabled, false, 'Hindi is off until the admin switches it on');
  assert.equal(r.body.settings.tour_enabled, true);
  assert.equal(r.body.settings.tour_steps[0].split('|').length, 3, 'tour steps are "emoji | title | text"');
  assert.ok(!('max_trackers_per_member' in r.body.settings), 'private settings are not public');
});

test('public: health check and unknown routes', async () => {
  const health = await fetch(captured.base.replace('/api', '/health'));
  assert.equal(health.status, 200);
  const r = await api('GET', '/does-not-exist');
  assert.equal(r.status, 404);
  assert.ok(r.body.error.message);
});

test('public: member routes need a sign-in', async () => {
  for (const path of ['/dashboard', '/trackers', '/dashboard/forest', '/dashboard/games', '/auth/me']) {
    const r = await api('GET', path);
    assert.equal(r.status, 401, `${path} should need sign-in`);
  }
  const r = await api('GET', '/dashboard', null, 'not-a-real-token');
  assert.equal(r.status, 401);
});
