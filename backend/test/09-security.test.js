/**
 * Security: strong passwords, token tampering, account locks (self-unlock by email), suspensions,
 * IP blocking (manual + automatic), and the admin Security page.
 * Requests that must come "from" another network use apiFrom(ip, …) so localhost is never blocked.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, apiFrom, captured, lastCode, login, register, settle, uniqueEmail } from './helpers.js';

const adminToken = async () => (await login('admin@test.local', 'adminpass123')).token;
const emailsTo = (email) => captured.emails.filter((e) => e.includes(`to=${email}`));

test('passwords: weak ones are refused everywhere', async () => {
  for (const password of ['password123', 'aaaaaaaa', 'qwertyuiop']) {
    const r = await api('POST', '/auth/register', { name: 'Weak', email: uniqueEmail('weak'), password, acceptTerms: true });
    assert.equal(r.status, 400, `${password} should be refused`);
    assert.equal(r.body.error.code, 'WEAK_PASSWORD');
  }
  const email = uniqueEmail('rahulsharma');
  let r = await api('POST', '/auth/register', { name: 'Rahul', email, password: `${email.split('@')[0]}!`, acceptTerms: true });
  assert.equal(r.body.error.code, 'WEAK_PASSWORD', 'password containing the email name is refused');

  const me = await register('Changer');
  r = await api('POST', '/auth/change-password', { currentPassword: me.password, newPassword: me.password }, me.token);
  assert.equal(r.body.error.code, 'SAME_PASSWORD');
  r = await api('POST', '/auth/change-password', { currentPassword: me.password, newPassword: 'password1' }, me.token);
  assert.equal(r.body.error.code, 'WEAK_PASSWORD');
  r = await api('POST', '/auth/change-password', { currentPassword: me.password, newPassword: 'Another-Strong-77' }, me.token);
  assert.equal(r.status, 200);
  await settle();
  assert.ok(emailsTo(me.email).some((e) => /password was changed/i.test(e)), 'owner is told their password changed');
});

test('sessions: forged and tampered tokens are rejected', async () => {
  const me = await register('Token');
  const [header, payload, signature] = me.token.split('.');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${payload}.`;
  assert.equal((await api('GET', '/auth/me', null, none)).status, 401, '"alg: none" token rejected');

  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const tampered = `${header}.${b64({ ...claims, sub: '00000000-0000-0000-0000-000000000000' })}.${signature}`;
  assert.equal((await api('GET', '/auth/me', null, tampered)).status, 401, 'edited token rejected');
  assert.equal((await api('GET', '/auth/me', null, me.token)).status, 200);
});

test('account lock: too many wrong passwords → locked, owner unlocks with the emailed code', async () => {
  const admin = await adminToken();
  await api('PUT', '/admin/settings', { values: { security_lock_after: 3 } }, admin);
  try {
    const me = await register('Locky');
    const ip = '198.51.100.21';
    let r = await apiFrom(ip, 'POST', '/auth/login', { email: me.email, password: 'wrong-1' });
    assert.equal(r.status, 401);
    await apiFrom(ip, 'POST', '/auth/login', { email: me.email, password: 'wrong-2' });
    r = await apiFrom(ip, 'POST', '/auth/login', { email: me.email, password: 'wrong-3' });
    assert.equal(r.status, 423, 'the 3rd wrong password locks the account');
    assert.equal(r.body.error.code, 'ACCOUNT_LOCKED');

    // Locked: even the right password is refused, and old sessions are signed out
    r = await apiFrom(ip, 'POST', '/auth/login', { email: me.email, password: me.password });
    assert.equal(r.status, 423);
    assert.equal((await api('GET', '/auth/me', null, me.token)).status, 401, 'sessions ended when locked');

    // The owner got an email with a code
    await settle();
    const code = lastCode(me.email);
    assert.ok(emailsTo(me.email).some((e) => /locked/i.test(e)));
    assert.match(code ?? '', /^\d{6}$/);

    // Wrong code, then a request for someone who isn't locked (same reply — no account discovery)
    r = await api('POST', '/auth/unlock', { email: me.email, code: code === '000000' ? '111111' : '000000' });
    assert.equal(r.body.error.code, 'CODE_INVALID');
    r = await api('POST', '/auth/unlock/request', { email: 'nobody@nowhere.test' });
    assert.equal(r.status, 200);

    // Right code → unlocked and signed in; the counter starts again
    r = await api('POST', '/auth/unlock', { email: me.email, code });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    assert.equal(r.body.user.locked, false);
    r = await apiFrom(ip, 'POST', '/auth/login', { email: me.email, password: me.password });
    assert.equal(r.status, 200);
    r = await api('POST', '/auth/unlock', { email: me.email, code });
    assert.equal(r.status, 400, 'an unlock code works once');

    // Resetting the password also unlocks (it proves the email too)
    for (const n of [1, 2, 3]) await apiFrom(ip, 'POST', '/auth/login', { email: me.email, password: `bad-${n}` });
    assert.equal((await apiFrom(ip, 'POST', '/auth/login', { email: me.email, password: me.password })).status, 423);
    await api('POST', '/auth/forgot-password', { email: me.email });
    await settle();
    r = await api('POST', '/auth/reset-password', { email: me.email, code: lastCode(me.email), password: 'Fresh-Start-2026' });
    assert.equal(r.status, 200);
    assert.equal((await apiFrom(ip, 'POST', '/auth/login', { email: me.email, password: 'Fresh-Start-2026' })).status, 200);
  } finally {
    await api('DELETE', '/admin/settings/security_lock_after', null, admin);
  }
});

test('admin: lock (owner can unlock), suspend with reason (only admin can lift), all emailed', async () => {
  const admin = await adminToken();
  const staff = (await login('staff@test.local', 'adminpass123')).token;
  const me = await register('Member');
  const before = emailsTo(me.email).length;

  // Lock: the member is signed out and can unlock themself
  let r = await api('POST', `/admin/users/${me.user.id}/lock`, null, staff);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.locked, true);
  assert.equal((await api('POST', `/admin/users/${me.user.id}/lock`, null, staff)).status, 400, 'already locked');
  assert.equal((await api('GET', '/auth/me', null, me.token)).status, 401);
  await settle();
  r = await api('POST', '/auth/unlock', { email: me.email, code: lastCode(me.email) });
  assert.equal(r.status, 200, 'member unlocked it themself');

  // Admin can also lock + unlock directly
  await api('POST', `/admin/users/${me.user.id}/lock`, null, staff);
  r = await api('POST', `/admin/users/${me.user.id}/unlock`, null, staff);
  assert.equal(r.body.user.locked, false);
  assert.equal((await api('POST', '/auth/login', { email: me.email, password: me.password })).status, 200);

  // Suspend with a reason: emailed, shown at sign-in, and an unlock code can't lift it
  r = await api('PATCH', `/admin/users/${me.user.id}`, { status: 'suspended', reason: 'Spam in feedback' }, staff);
  assert.equal(r.body.user.status, 'suspended');
  assert.equal(r.body.user.suspendReason, 'Spam in feedback');
  r = await api('POST', '/auth/login', { email: me.email, password: me.password });
  assert.equal(r.status, 403);
  assert.match(r.body.error.message, /Spam in feedback/);
  r = await api('POST', '/auth/forgot-password', { email: me.email });
  assert.equal(r.status, 200, 'same reply, but suspended accounts get no reset code');

  // Reactivate: emailed too
  r = await api('PATCH', `/admin/users/${me.user.id}`, { status: 'active' }, staff);
  assert.equal(r.body.user.suspendReason, null);
  assert.equal((await api('POST', '/auth/login', { email: me.email, password: me.password })).status, 200);
  await settle();
  const mails = emailsTo(me.email).slice(before).join('\n');
  assert.match(mails, /locked/i);
  assert.match(mails, /suspended/i);
  assert.match(mails, /active again/i);

  // Audited
  r = await api('GET', '/admin/audit-logs', null, admin);
  for (const action of ['user.lock', 'user.unlock', 'user.update']) assert.ok(r.body.logs.some((l) => l.action === action), action);
});

test('IP blocking: manual blocks, ranges, self-protection, automatic blocks', async () => {
  const admin = await adminToken();
  const staff = (await login('staff@test.local', 'adminpass123')).token;
  assert.equal((await api('GET', '/admin/security', null, staff)).status, 403, 'only super admins manage IP blocks');

  // Invalid / too-wide / own IP are refused
  for (const target of ['not-an-ip', '1.2.3.4/40', '0.0.0.0/0', '1.2.3.4/24/1']) {
    assert.equal((await api('POST', '/admin/security/ips', { target }, admin)).status, 400, `${target} refused`);
  }
  let r = await api('POST', '/admin/security/ips', { target: '127.0.0.1' }, admin);
  assert.equal(r.body.error.code, 'SELF_BLOCK');
  r = await api('POST', '/admin/security/ips', { target: '127.0.0.0/8' }, admin);
  assert.equal(r.body.error.code, 'SELF_BLOCK', 'a range containing my own IP is refused');

  // Block a range
  r = await api('POST', '/admin/security/ips', { target: '203.0.113.0/24', reason: 'Scraping' }, admin);
  assert.equal(r.status, 201);
  const rangeId = r.body.id;
  r = await apiFrom('203.0.113.9', 'GET', '/config');
  assert.equal(r.status, 403);
  assert.equal(r.body.error.code, 'IP_BLOCKED');
  assert.equal((await apiFrom('::ffff:203.0.113.10', 'GET', '/config')).status, 403, 'IPv4 written as IPv6 is caught too');
  assert.equal((await apiFrom('203.0.114.1', 'GET', '/config')).status, 200, 'outside the range is fine');

  // Temporary block of one IPv6 address
  r = await api('POST', '/admin/security/ips', { target: '2001:db8::1', hours: 2 }, admin);
  assert.equal(r.status, 201);
  assert.equal((await apiFrom('2001:db8::1', 'GET', '/config')).status, 403);
  r = await api('GET', '/admin/security', null, admin);
  const v6 = r.body.blocked.find((b) => b.target === '2001:db8::1');
  assert.ok(v6.expiresAt, 'temporary block has an end time');
  assert.equal(r.body.yourIp, '127.0.0.1');

  // Unblock
  assert.equal((await api('DELETE', `/admin/security/ips/${rangeId}`, null, admin)).status, 204);
  assert.equal((await apiFrom('203.0.113.9', 'GET', '/config')).status, 200);
  await api('DELETE', `/admin/security/ips/${v6.id}`, null, admin);
  assert.equal((await api('DELETE', '/admin/security/ips/not-a-uuid', null, admin)).status, 404);

  // Automatic: one IP failing on many accounts gets a temporary block
  await api('PUT', '/admin/settings', { values: { security_ip_block_after: 10 } }, admin);
  try {
    const attacker = '192.0.2.50';
    for (let i = 0; i < 10; i++) await apiFrom(attacker, 'POST', '/auth/login', { email: `target${i}@t.local`, password: 'guess' });
    r = await apiFrom(attacker, 'GET', '/config');
    assert.equal(r.status, 403, 'attacker IP blocked automatically');
    assert.equal((await api('GET', '/config')).status, 200, 'everyone else unaffected');
    r = await api('GET', '/admin/security', null, admin);
    const auto = r.body.blocked.find((b) => b.target === attacker);
    assert.ok(auto.auto && auto.expiresAt, 'auto block is temporary');
    assert.ok(r.body.failing.some((f) => f.ip === attacker && f.accounts === 10));
    assert.ok(r.body.events.some((e) => e.kind === 'ip_auto_blocked' && e.ip === attacker));
    await api('DELETE', `/admin/security/ips/${auto.id}`, null, admin);
    assert.equal((await apiFrom(attacker, 'GET', '/config')).status, 200);
  } finally {
    await api('DELETE', '/admin/settings/security_ip_block_after', null, admin);
  }

  r = await api('GET', '/admin/audit-logs', null, admin);
  assert.ok(r.body.logs.some((l) => l.action === 'security.block_ip'));
  assert.ok(r.body.logs.some((l) => l.action === 'security.unblock_ip'));
});

test('admin notifications can go to one specific member', async () => {
  const staff = (await login('staff@test.local', 'adminpass123')).token;
  const me = await register('Single');
  await api('PUT', '/auth/me/push-token', { token: 'ExponentPushToken[single]' }, me.token);
  let r = await api('POST', '/admin/push/count', { audience: { kind: 'member', email: me.email } }, staff);
  assert.equal(r.body.count, 1);
  r = await api('POST', '/admin/push/count', { audience: { kind: 'member', email: 'not-an-email' } }, staff);
  assert.equal(r.status, 400);
});
