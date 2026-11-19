/**
 * Admin panel API. Runs last: it changes app-wide settings (and puts every one back).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, login, register } from './helpers.js';

const ok = (r, status = 200) => assert.equal(r.status, status, JSON.stringify(r.body));

test('admin roles: who can open what, who can change whom', async () => {
  const boss = await login('boss@test.local', 'superpass123');
  assert.equal(boss.user.role, 1);
  assert.equal(boss.user.roleName, 'super_admin');
  assert.ok(boss.user.permissions.includes('admins.manage'));
  const staff = await login('staff@test.local', 'adminpass123');
  assert.equal(staff.user.role, 2);
  assert.ok(!staff.user.permissions.includes('admins.manage') && !staff.user.permissions.includes('audit.view'));

  const member = await register('Neha');
  assert.ok(!member.user.permissions, 'members have no permissions');
  const uid = member.user.id;

  assert.equal((await api('GET', '/admin/overview', null, member.token)).status, 403, 'members are blocked from admin');
  ok(await api('GET', '/admin/overview', null, staff.token));
  assert.equal((await api('GET', '/admin/audit-logs', null, staff.token)).status, 403);
  ok(await api('GET', '/admin/audit-logs', null, boss.token));
  ok(await api('GET', '/admin/templates', null, staff.token));

  let r = await api('GET', '/admin/users?role=2', null, boss.token);
  assert.ok(r.body.users.every((u) => u.role === 2) && r.body.users.some((u) => u.email === 'staff@test.local'));
  r = await api('GET', `/admin/users?search=${encodeURIComponent(member.email)}`, null, staff.token);
  assert.equal(r.body.total, 1);
  r = await api('GET', `/admin/users/${uid}`, null, staff.token);
  ok(r);
  assert.ok(r.body.counts && !Array.isArray(r.body.trades), 'staff see counts, never the content');

  // An admin (2) acting on a member
  ok(await api('PATCH', `/admin/users/${uid}`, { status: 'suspended' }, staff.token));
  assert.equal((await api('GET', '/auth/me', null, member.token)).status >= 401, true, 'suspended session ends');
  assert.equal((await api('POST', '/auth/login', { email: member.email, password: member.password })).status, 403, 'suspended member cannot sign in');
  ok(await api('PATCH', `/admin/users/${uid}`, { status: 'active' }, staff.token));
  ok(await api('POST', '/auth/login', { email: member.email, password: member.password }));
  assert.equal((await api('PATCH', `/admin/users/${uid}`, { role: 2 }, staff.token)).status, 403, 'admins cannot promote');
  assert.equal((await api('DELETE', `/admin/users/${uid}`, null, staff.token)).status, 403, 'admins cannot delete accounts');

  // Protecting staff accounts
  assert.equal((await api('PATCH', `/admin/users/${boss.user.id}`, { status: 'suspended' }, staff.token)).status, 403);
  assert.equal((await api('PATCH', `/admin/users/${staff.user.id}`, { status: 'suspended' }, staff.token)).status, 400, 'cannot suspend yourself');
  assert.equal((await api('PATCH', `/admin/users/${boss.user.id}`, { role: 3 }, boss.token)).status, 400, 'cannot demote yourself');
  assert.equal((await api('PATCH', `/admin/users/${uid}`, { role: 1 }, boss.token)).status, 400, 'super admin is never granted via the API');

  // Super admin promotes, demotes, deletes
  assert.equal((await api('PATCH', `/admin/users/${uid}`, { role: 2 }, boss.token)).body.user.role, 2);
  const promoted = await login(member.email, member.password);
  ok(await api('GET', '/admin/overview', null, promoted.token));
  assert.equal((await api('PATCH', `/admin/users/${uid}`, { status: 'suspended' }, staff.token)).status, 403, 'admins cannot suspend admins');
  assert.equal((await api('PATCH', `/admin/users/${uid}`, { role: 3 }, boss.token)).body.user.role, 3);
  assert.equal((await api('GET', '/admin/overview', null, promoted.token)).status, 403, 'demotion takes effect immediately');
  ok(await api('DELETE', `/admin/users/${uid}`, null, boss.token), 204);

  r = await api('GET', '/admin/audit-logs', null, boss.token);
  assert.ok(r.body.logs.some((l) => l.action === 'user.update' && l.meta.role === 'admin'), 'role change is audited');
});

test('admin settings: validated, public ones reach the app, can be reset', async () => {
  const boss = (await login('boss@test.local', 'superpass123')).token;
  const staff = (await login('staff@test.local', 'adminpass123')).token;

  assert.equal((await api('GET', '/admin/settings', null, staff)).status, 403, 'admins (2) cannot change settings');
  let r = await api('GET', '/admin/settings', null, boss);
  assert.ok(r.body.settings.some((s) => s.key === 'support_email' && s.group === 'General'));
  const theme = r.body.settings.find((s) => s.key === 'default_theme');
  assert.equal(theme.type, 'select');
  assert.equal(theme.options.length, 3);

  for (const values of [{ support_email: 'not-an-email' }, { min_app_version: 'v2' }, { nope: 1 }, { default_theme: 'pink' }]) {
    assert.equal((await api('PUT', '/admin/settings', { values }, boss)).status, 400, `rejects ${JSON.stringify(values)}`);
  }
  r = await api('PUT', '/admin/settings', { values: { support_email: 'help@anchor.app', default_theme: 'light', daily_quotes: ['Stay anchored.'] } }, boss);
  ok(r);
  assert.equal(r.body.changed.length, 3);
  r = await api('GET', '/config');
  assert.equal(r.body.settings.support_email, 'help@anchor.app');
  assert.equal(r.body.settings.default_theme, 'light');
  assert.equal(r.body.settings.daily_quotes[0], 'Stay anchored.');
  for (const key of ['support_email', 'default_theme', 'daily_quotes']) ok(await api('DELETE', `/admin/settings/${key}`, null, boss), 204);
  assert.equal((await api('GET', '/config')).body.settings.default_theme, 'dark', 'reset restores the default');

  // Tracker limit
  const member = await register('Limits');
  ok(await api('PUT', '/admin/settings', { values: { max_trackers_per_member: 1 } }, boss));
  ok(await api('POST', '/trackers', { type: 'habit', name: 'One' }, member.token), 201);
  r = await api('POST', '/trackers', { type: 'habit', name: 'Two' }, member.token);
  assert.equal(r.body.error.code, 'LIMIT');
  ok(await api('DELETE', '/admin/settings/max_trackers_per_member', null, boss), 204);

  // Feature switches
  ok(await api('PUT', '/admin/settings', { values: { feature_trading: false, feature_gamification: false } }, boss));
  r = await api('POST', '/trackers', { type: 'trading', name: 'Nope' }, member.token);
  assert.equal(r.body.error.code, 'FEATURE_OFF');
  assert.equal((await api('GET', '/dashboard', null, member.token)).body.game, null, 'no game data when games are off');
  assert.equal((await api('GET', '/dashboard/games', null, member.token)).status, 404);
  assert.equal((await api('GET', '/dashboard/forest', null, member.token)).status, 404);
  for (const key of ['feature_trading', 'feature_gamification']) ok(await api('DELETE', `/admin/settings/${key}`, null, boss), 204);

  // Maintenance mode and sign-ups
  ok(await api('PUT', '/admin/settings', { values: { maintenance_mode: true, maintenance_message: 'Back at 6pm' } }, boss));
  r = await api('GET', '/dashboard', null, member.token);
  assert.equal(r.status, 503);
  assert.equal(r.body.error.message, 'Back at 6pm');
  ok(await api('GET', '/dashboard', null, staff), 200);
  assert.equal((await api('POST', '/auth/register', { name: 'X', email: 'x1@t.local', password: 'password123', acceptTerms: true })).status, 503);
  ok(await api('PUT', '/admin/settings', { values: { maintenance_mode: false, signups_enabled: false } }, boss));
  r = await api('POST', '/auth/register', { name: 'X', email: 'x2@t.local', password: 'password123', acceptTerms: true });
  assert.equal(r.body.error.code, 'SIGNUPS_CLOSED');
  for (const key of ['maintenance_mode', 'maintenance_message', 'signups_enabled']) ok(await api('DELETE', `/admin/settings/${key}`, null, boss), 204);
  assert.equal((await api('GET', '/config')).body.settings.signups_enabled, true);
});

test('admin content: announcements, templates and the feedback inbox', async () => {
  const boss = (await login('boss@test.local', 'superpass123')).token;
  const staff = (await login('staff@test.local', 'adminpass123')).token;

  // Announcements
  let r = await api('POST', '/admin/announcements', { title: 'New: budgets!', body: 'Track spending', level: 'success', ctaLabel: 'Try it', ctaUrl: 'https://anchor.app' }, staff);
  ok(r, 201);
  assert.equal(r.body.announcement.live, true);
  const annId = r.body.announcement.id;
  await api('POST', '/admin/announcements', { title: 'Future', startsAt: new Date(Date.now() + 86_400_000).toISOString() }, staff);
  assert.equal((await api('POST', '/admin/announcements', { title: 'Bad', startsAt: '2030-01-02T00:00:00Z', endsAt: '2030-01-01T00:00:00Z' }, staff)).status, 400);
  r = await api('GET', '/config');
  assert.deepEqual(r.body.announcements.map((a) => a.title), ['New: budgets!'], 'only live announcements are public');
  assert.equal((await api('PATCH', `/admin/announcements/${annId}`, { active: false }, staff)).body.announcement.live, false);
  assert.equal((await api('GET', '/config')).body.announcements.length, 0);

  // Templates
  r = await api('POST', '/admin/templates', { slug: 'yoga-test', category: 'fitness', type: 'habit', name: 'Yoga', config: { goalType: 'duration', target: 20, unit: 'min' } }, staff);
  ok(r, 201);
  assert.equal((await api('POST', '/admin/templates', { slug: 'bad', category: 'fitness', type: 'habit', name: 'Bad', config: { kind: 'nope' } }, staff)).status, 400);
  assert.ok((await api('GET', '/templates')).body.templates.some((t) => t.slug === 'yoga-test'));
  await api('PATCH', `/admin/templates/${r.body.template.id}`, { active: false }, staff);
  assert.ok(!(await api('GET', '/templates')).body.templates.some((t) => t.slug === 'yoga-test'), 'inactive templates are hidden');

  // Feedback
  const before = (await api('GET', '/admin/feedback?status=new', null, staff)).body.counts.new ?? 0; // a status appears once it has items
  assert.equal((await api('POST', '/feedback', { kind: 'bug', message: 'App crashed' })).status, 400, 'guests must leave an email');
  ok(await api('POST', '/feedback', { kind: 'idea', message: 'Light theme please', email: 'guest@t.local' }), 201);
  const member = await register('Feedback');
  ok(await api('POST', '/feedback', { kind: 'bug', message: 'Chart looks off', appVersion: '1.0.0', platform: 'android' }, member.token), 201);
  r = await api('GET', '/admin/feedback?status=new', null, staff);
  assert.equal(r.body.counts.new, before + 2);
  const fb = r.body.feedback.find((f) => f.message === 'Chart looks off');
  assert.equal(fb.userName, 'Feedback');
  r = await api('PATCH', `/admin/feedback/${fb.id}`, { status: 'resolved', adminNote: 'Fixed in 1.0.1' }, staff);
  assert.equal(r.body.feedback.status, 'resolved');

  // The app reports its own crashes — no email needed
  ok(await api('POST', '/feedback', { kind: 'crash', message: 'TypeError: x is undefined\n  at Today', appVersion: '1.0.0', platform: 'android' }), 201);
  r = await api('GET', '/admin/feedback?kind=crash', null, staff);
  assert.equal(r.body.feedback.length, 1);
  assert.equal(r.body.feedback[0].email, null);

  // System and analytics
  assert.equal((await api('GET', '/admin/system', null, staff)).status, 403);
  r = await api('GET', '/admin/system', null, boss);
  assert.equal(r.body.database.ok, true);
  assert.equal(r.body.migrations.pending.length, 0);
  assert.equal(r.body.email.problem, null);
  r = await api('POST', '/admin/system/test-email', { to: 'me@t.local' }, boss);
  assert.equal(r.body.provider, 'console');
  r = await api('GET', '/admin/analytics', null, staff);
  assert.equal(r.body.activeSeries.length, 30);
  assert.ok(Array.isArray(r.body.ruleBreaks));
  r = await api('GET', '/admin/audit-logs', null, boss);
  for (const action of ['settings.update', 'announcement.create', 'feedback.update', 'system.test_email']) {
    assert.ok(r.body.logs.some((l) => l.action === action), `${action} is audited`);
  }
});

test('admin: the last super admin can never remove themselves', async () => {
  const boss = (await login('boss@test.local', 'superpass123')).token;
  const second = (await login('admin@test.local', 'adminpass123')).token;
  ok(await api('DELETE', '/auth/me', { password: 'superpass123' }, boss), 204);
  const r = await api('DELETE', '/auth/me', { password: 'adminpass123' }, second);
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'LAST_SUPER_ADMIN');
});
