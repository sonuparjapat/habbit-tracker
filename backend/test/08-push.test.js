/**
 * Admin → Notifications: phone notifications sent by the team. Uses a fake push sender.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { push } from '../src/services/push.js';
import { api, login, register } from './helpers.js';

const TOKEN = (name) => `ExponentPushToken[${name}]`;

test('admin notifications: audiences, opt-out, test send, history', async () => {
  const sent = [];
  const realSend = push.send;
  push.send = async (messages) => {
    sent.push(...messages);
    return messages.map((m) => (m.to === TOKEN('uninstalled') ? { ok: false, unregistered: true } : { ok: true }));
  };

  try {
    const staff = await login('staff@test.local', 'adminpass123'); // role 2 has "content" permission
    await api('PUT', '/auth/me/push-token', { token: TOKEN('staff') }, staff.token);

    // Members with phones connected
    const fit = await register('Fit', { interests: ['fitness'] });
    await api('PUT', '/auth/me/push-token', { token: TOKEN('fit') }, fit.token);
    const money = await register('Money', { interests: ['money'] });
    await api('PUT', '/auth/me/push-token', { token: TOKEN('money') }, money.token);
    const optedOut = await register('NoNews', { interests: ['fitness'] });
    await api('PUT', '/auth/me/push-token', { token: TOKEN('nonews') }, optedOut.token);
    const r0 = await api('PATCH', '/auth/me', { pushNews: false }, optedOut.token);
    assert.equal(r0.body.user.pushNews, false);
    const gone = await register('Gone', { interests: ['fitness'] });
    await api('PUT', '/auth/me/push-token', { token: TOKEN('uninstalled') }, gone.token);
    await register('NoPhone', { interests: ['fitness'] }); // never allowed notifications

    // Members can't use it
    assert.equal((await api('GET', '/admin/push', null, fit.token)).status, 403);

    let r = await api('GET', '/admin/push', null, staff.token);
    assert.equal(r.status, 200);
    assert.ok(r.body.links['/games'] && r.body.interests.includes('fitness'));

    // Audience counts
    r = await api('POST', '/admin/push/count', { audience: { kind: 'interest', interest: 'fitness' } }, staff.token);
    assert.equal(r.body.count, 2, 'fitness: Fit + Gone (NoNews opted out, NoPhone has no phone)');
    r = await api('POST', '/admin/push/count', { audience: { kind: 'interest', interest: 'nope' } }, staff.token);
    assert.equal(r.status, 400);

    // Validation
    r = await api('POST', '/admin/push/send', { title: '', body: 'x' }, staff.token);
    assert.equal(r.status, 400);
    r = await api('POST', '/admin/push/send', { title: 'Hi', body: 'x', link: '/not-a-screen' }, staff.token);
    assert.equal(r.status, 400);

    // Test send goes only to me
    r = await api('POST', '/admin/push/send', { title: 'Test', body: 'Only me', test: true }, staff.token);
    assert.equal(r.body.result.recipients, 1);
    assert.deepEqual(sent.map((m) => m.to), [TOKEN('staff')]);

    // Real send to the fitness audience, opening the Arcade
    sent.length = 0;
    r = await api('POST', '/admin/push/send', { title: 'New boss this week! 🐉', body: 'Beat the Doubt Dragon.', link: '/games', audience: { kind: 'interest', interest: 'fitness' } }, staff.token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.result, { recipients: 2, delivered: 1, failed: 1 });
    assert.deepEqual(sent.map((m) => m.to).sort(), [TOKEN('fit'), TOKEN('uninstalled')].sort());
    assert.equal(sent[0].channelId, 'updates');
    assert.equal(sent[0].data.url, '/games');
    assert.equal((await api('GET', '/auth/me', null, gone.token)).body.user.hasPushToken, false, 'uninstalled phone forgotten');

    // History + audit
    r = await api('GET', '/admin/push', null, staff.token);
    assert.equal(r.body.campaigns[0].title, 'New boss this week! 🐉');
    assert.equal(r.body.campaigns[0].delivered, 1);
    assert.equal(r.body.campaigns[0].sentBy, 'staff@test.local');
    const admin = (await login('admin@test.local', 'adminpass123')).token;
    r = await api('GET', '/admin/audit-logs', null, admin);
    assert.ok(r.body.logs.some((l) => l.action === 'push.send'));

    // Win-back audience: nobody has been away 30 days in a fresh test run
    r = await api('POST', '/admin/push/count', { audience: { kind: 'inactive', days: 30 } }, staff.token);
    assert.equal(r.body.count, 0);
  } finally {
    push.send = realSend;
  }
});
