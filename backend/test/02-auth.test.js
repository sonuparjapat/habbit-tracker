import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, lastCode, settle, TZ, uniqueEmail } from './helpers.js';

test('auth: sign up, verify email, passwords, export, delete', async () => {
  const email = uniqueEmail('asha');
  let r = await api('POST', '/auth/register', { name: 'Asha', email, password: 'Steady-Habit-42' });
  assert.equal(r.status, 400, 'terms consent is required');
  assert.match(r.body.error.message, /Terms/);

  r = await api('POST', '/auth/register', { name: 'Asha', email, password: 'Steady-Habit-42', acceptTerms: true, timezone: TZ, currency: 'INR', interests: ['trading', 'fitness'] });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.emailVerified, false);
  assert.equal(r.body.user.role, 3, 'new sign-ups are members');
  assert.equal(r.body.user.isAdmin, false);
  assert.equal(r.body.user.interests.join(), 'trading,fitness');
  let token = r.body.token;

  r = await api('POST', '/auth/register', { name: 'Asha', email, password: 'Steady-Habit-42', acceptTerms: true });
  assert.equal(r.status, 409, 'duplicate email rejected');

  // Email verification
  await settle();
  const code = lastCode(email);
  assert.match(code ?? '', /^\d{6}$/, 'verification email sent');
  r = await api('POST', '/auth/verify-email', { code: code === '000000' ? '111111' : '000000' }, token);
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'CODE_INVALID');
  r = await api('POST', '/auth/verify-email', { code }, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.emailVerified, true);

  // Sign in
  r = await api('POST', '/auth/login', { email, password: 'nope' });
  assert.equal(r.status, 401);
  r = await api('POST', '/auth/login', { email: email.toUpperCase(), password: 'Steady-Habit-42' });
  assert.equal(r.status, 200, 'email is case-insensitive');

  // Profile
  r = await api('PATCH', '/auth/me', { name: 'Asha K' }, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'Asha K');

  // Change password ends other sessions
  r = await api('POST', '/auth/change-password', { currentPassword: 'Steady-Habit-42', newPassword: 'newpassword1' }, token);
  assert.equal(r.status, 200);
  const oldToken = token;
  token = r.body.token;
  assert.equal((await api('GET', '/auth/me', null, oldToken)).status, 401, 'old sessions revoked');
  assert.equal((await api('GET', '/auth/me', null, token)).status, 200);

  // Forgot / reset password
  r = await api('POST', '/auth/forgot-password', { email: 'nobody@nowhere.test' });
  assert.equal(r.status, 200, 'does not reveal whether an account exists');
  r = await api('POST', '/auth/forgot-password', { email });
  assert.equal(r.status, 200);
  await settle();
  const resetCode = lastCode(email);
  assert.notEqual(resetCode, code);
  r = await api('POST', '/auth/reset-password', { email, code: resetCode, password: 'resetpass123' });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  token = r.body.token;
  r = await api('POST', '/auth/reset-password', { email, code: resetCode, password: 'again12345' });
  assert.equal(r.status, 400, 'reset code is single-use');

  // Export my data
  r = await api('GET', '/auth/me/export', null, token);
  assert.equal(r.status, 200);
  assert.ok(r.body.consents.length >= 3);

  // Delete my account
  r = await api('DELETE', '/auth/me', { password: 'wrong' }, token);
  assert.equal(r.status, 400, 'delete needs the right password');
  r = await api('DELETE', '/auth/me', { password: 'resetpass123' }, token);
  assert.equal(r.status, 204);
  assert.equal((await api('GET', '/auth/me', null, token)).status, 401);
  assert.equal((await api('POST', '/auth/login', { email, password: 'resetpass123' })).status, 401);
});

test('auth: login takes similar time for unknown and known emails', async () => {
  const time = async (email) => {
    const start = performance.now();
    await api('POST', '/auth/login', { email, password: 'definitely-wrong' });
    return performance.now() - start;
  };
  await time('nobody@t.local'); // warm up
  const unknown = ((await time('nobody1@t.local')) + (await time('nobody2@t.local'))) / 2;
  const known = ((await time('staff@test.local')) + (await time('staff@test.local'))) / 2;
  assert.ok(unknown > known * 0.5, `unknown ${unknown.toFixed(0)}ms vs known ${known.toFixed(0)}ms`);
});

test('auth: wrong-password limit is per account, not per shared IP', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await api('POST', '/auth/login', { email: 'victim@t.local', password: `guess${i}` });
  assert.equal(last.status, 429);
  assert.equal(last.body.error.code, 'RATE_LIMITED');
  const r = await api('POST', '/auth/login', { email: 'staff@test.local', password: 'adminpass123' });
  assert.equal(r.status, 200, 'someone else on the same IP can still sign in');
});
