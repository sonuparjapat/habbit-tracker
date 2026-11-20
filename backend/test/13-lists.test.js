/**
 * Admin lists: every growing list can be searched and paged, the same way (?q= ?page= ?limit=).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, login, register } from './helpers.js';

const pages = (r) => [r.body.page, r.body.pages, r.body.total];

test('admin lists: search and paging on audit log, feedback, announcements, notifications, sync, security log', async () => {
  const admin = (await login('admin@test.local', 'adminpass123')).token;

  // Announcements: make 3, search one, page through
  for (const title of ['Paging alpha', 'Paging beta', 'Paging gamma 50%']) await api('POST', '/admin/announcements', { title, active: false }, admin);
  let r = await api('GET', '/admin/announcements?q=Paging&limit=2', null, admin);
  assert.equal(r.status, 200);
  assert.deepEqual(pages(r), [1, 2, 3]);
  assert.equal(r.body.announcements.length, 2);
  r = await api('GET', '/admin/announcements?q=Paging&limit=2&page=2', null, admin);
  assert.equal(r.body.announcements.length, 1);
  r = await api('GET', `/admin/announcements?q=${encodeURIComponent('50%')}`, null, admin);
  assert.deepEqual(r.body.announcements.map((a) => a.title), ['Paging gamma 50%'], '"%" is searched as text, not a wildcard');
  r = await api('GET', '/admin/announcements?q=nothing-matches-this', null, admin);
  assert.deepEqual(pages(r), [1, 1, 0]);

  // Feedback: search by message, together with a status filter
  const member = await register('Lister');
  await api('POST', '/feedback', { kind: 'idea', message: 'Please add a zebra mode' }, member.token);
  r = await api('GET', '/admin/feedback?q=zebra', null, admin);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.feedback[0].userName, 'Lister');
  r = await api('GET', '/admin/feedback?q=zebra&status=resolved', null, admin);
  assert.equal(r.body.total, 0);
  r = await api('GET', `/admin/feedback?q=${encodeURIComponent(member.email)}`, null, admin);
  assert.equal(r.body.total, 1, 'search by email');

  // Audit log: search by action
  r = await api('GET', '/admin/audit-logs?q=announcement.create&limit=2', null, admin);
  assert.ok(r.body.total >= 3 && r.body.logs.length === 2 && r.body.logs.every((l) => l.action === 'announcement.create'));

  // Sent notifications
  r = await api('GET', '/admin/push?q=boss', null, admin);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.campaigns) && typeof r.body.total === 'number' && typeof r.body.sentTotal === 'number');

  // Offline sync: search within a status
  r = await api('GET', '/admin/sync?status=applied&q=entries&limit=5', null, admin);
  assert.equal(r.status, 200);
  assert.ok(r.body.ops.length <= 5 && r.body.ops.every((o) => o.status === 'applied' && o.path.includes('entries')));

  // Security log: filter by kind + search
  r = await api('GET', '/admin/security/events?kind=login_failed&limit=3', null, admin);
  assert.equal(r.status, 200);
  assert.ok(r.body.events.length <= 3 && r.body.events.every((e) => e.kind === 'login_failed'));
  assert.ok(r.body.pages >= 1);

  // Bad paging input is refused cleanly
  assert.equal((await api('GET', '/admin/announcements?page=0', null, admin)).status, 400);
  assert.equal((await api('GET', '/admin/announcements?limit=1000', null, admin)).status, 400);
});
