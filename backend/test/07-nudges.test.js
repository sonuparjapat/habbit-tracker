/**
 * Evening check-in: only opted-in members, only trackers with a reminder, only if missed, once a day.
 * Push messages go to a fake sender here (nothing leaves the machine); emails are captured by run.js.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { push } from '../src/services/push.js';
import { runNudges } from '../src/services/nudges.js';
import { api, captured, lastCode, login, register, settle, today } from './helpers.js';

const TOKEN = (name) => `ExponentPushToken[${name}]`;

test('evening check-in: nudges only members who opted in and missed a tracker', async () => {
  // Fake Expo: record every message; the "gone" phone reports the app was uninstalled
  const sent = [];
  const realSend = push.send;
  push.send = async (messages) => {
    sent.push(...messages);
    return messages.map((m) => (m.to === TOKEN('gone') ? { ok: false, unregistered: true } : { ok: true }));
  };

  // Check every member right away, whatever their local time (admin@test.local is still a super admin)
  const admin = (await login('admin@test.local', 'adminpass123')).token;
  assert.equal((await api('PUT', '/admin/settings', { values: { nudge_hour: 0 } }, admin)).status, 200);

  const habit = (token, reminderTime) => api('POST', '/trackers', { type: 'habit', name: 'Read', config: { reminderTime } }, token);

  try {
    // A: opted in to push + email (verified), habit with a reminder, not done → nudged both ways
    const a = await register('Missed');
    await settle();
    await api('POST', '/auth/verify-email', { code: lastCode(a.email) }, a.token);
    assert.equal((await api('PUT', '/auth/me/push-token', { token: 'hello' }, a.token)).status, 400, 'only real Expo tokens are accepted');
    assert.equal((await api('PUT', '/auth/me/push-token', { token: TOKEN('a') }, a.token)).status, 204);
    let r = await api('PATCH', '/auth/me', { nudgePush: true, nudgeEmail: true }, a.token);
    assert.equal(r.body.user.nudgePush, true);
    assert.equal(r.body.user.nudgeEmail, true);
    assert.equal(r.body.user.hasPushToken, true);
    assert.ok(!('push_token' in r.body.user), 'the token itself is never sent back');
    await habit(a.token, '09:00');

    // B: opted in, but already checked in → left alone
    const b = await register('Done');
    await api('PUT', '/auth/me/push-token', { token: TOKEN('b') }, b.token);
    await api('PATCH', '/auth/me', { nudgePush: true }, b.token);
    const bh = (await habit(b.token, '09:00')).body.tracker.id;
    await api('PUT', `/trackers/${bh}/entries/${today}`, { completed: true }, b.token);

    // C: missed, but never opted in → left alone
    const c = await register('Quiet');
    await api('PUT', '/auth/me/push-token', { token: TOKEN('c') }, c.token);
    await habit(c.token, '09:00');

    // D: opted in, missed a tracker WITHOUT a reminder → left alone (that tracker isn't opted in)
    const d = await register('NoReminder');
    await api('PUT', '/auth/me/push-token', { token: TOKEN('d') }, d.token);
    await api('PATCH', '/auth/me', { nudgePush: true }, d.token);
    await habit(d.token, null);

    // E: opted in and missed, but the app was uninstalled → token forgotten
    const e = await register('Gone');
    await api('PUT', '/auth/me/push-token', { token: TOKEN('gone') }, e.token);
    await api('PATCH', '/auth/me', { nudgePush: true }, e.token);
    await habit(e.token, '09:00');

    const emailsBefore = captured.emails.length;
    const summary = await runNudges();
    await settle();

    const to = sent.map((m) => m.to).sort();
    assert.deepEqual(to, [TOKEN('a'), TOKEN('gone')], 'only members who opted in AND missed get a push');
    const msg = sent.find((m) => m.to === TOKEN('a'));
    assert.match(msg.title, /Read/);
    assert.equal(msg.data.url, '/');
    const newEmails = captured.emails.slice(emailsBefore);
    assert.equal(newEmails.length, 1, 'one email, to A only');
    assert.ok(newEmails[0].includes(`to=${a.email}`));
    assert.ok(summary.nudged >= 2 && summary.pushes >= 1 && summary.emails === 1, JSON.stringify(summary));
    assert.equal((await api('GET', '/auth/me', null, e.token)).body.user.hasPushToken, false, 'dead token removed');

    // Running again the same day sends nothing more
    sent.length = 0;
    await runNudges();
    assert.equal(sent.length, 0, 'never two nudges in one day');

    // Admin can see opt-ins and run it on demand
    r = await api('GET', '/admin/system', null, admin);
    assert.ok(r.body.nudges.optedInPush >= 3 && r.body.nudges.optedInEmail >= 1, JSON.stringify(r.body.nudges));
    assert.ok(r.body.nudges.lastRun);
    r = await api('POST', '/admin/system/run-nudges', null, admin);
    assert.equal(r.status, 200);
    assert.equal(r.body.summary.checked, 0, 'everyone was already checked today');

    // Switched off by the admin → nothing runs
    await api('PUT', '/admin/settings', { values: { nudge_enabled: false } }, admin);
    assert.equal((await runNudges()).skipped, 'switched off');

    // Signing out clears the phone's token
    assert.equal((await api('PUT', '/auth/me/push-token', { token: null }, a.token)).status, 204);
    assert.equal((await api('GET', '/auth/me', null, a.token)).body.user.hasPushToken, false);
  } finally {
    push.send = realSend;
    for (const key of ['nudge_hour', 'nudge_enabled']) await api('DELETE', `/admin/settings/${key}`, null, admin);
  }
});
