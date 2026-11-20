/**
 * Hindi replies: the app sends X-App-Language: hi and the server's own text comes back in Hindi.
 * What the member wrote (notes, tracker names they typed) is never changed; English stays English.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translateText } from '../src/middleware/localize.js';
import { api, captured, daysAgo, register, today } from './helpers.js';

const hindi = async (method, path, body, token) => {
  const res = await fetch(captured.base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-app-language': 'hi', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

test('language: sentences with numbers, money and names translate; unknown text stays as it is', () => {
  assert.equal(translateText('🔥 4-day streak at risk — Read'), '🔥 4 दिन की streak ख़तरे में — पढ़ें', 'built-in template names translate');
  assert.equal(translateText('🔥 4-day streak at risk — My guitar'), '🔥 4 दिन की streak ख़तरे में — My guitar', 'names the member typed stay');
  assert.equal(translateText('Day closed at -₹1,300, beyond the ₹1,000 limit'), 'दिन -₹1,300 पर बंद हुआ, ₹1,000 की सीमा से आगे');
  assert.equal(translateText('Wednesdays are your weak spot'), 'बुधवार आपका कमज़ोर दिन है');
  assert.equal(translateText('password: Password must be at least 8 characters'), 'पासवर्ड कम से कम 8 अक्षर का होना चाहिए');
  assert.equal(translateText('name: something we have no translation for'), 'name: something we have no translation for');
  assert.equal(translateText('My own words'), 'My own words');
});

test('language: alerts, badges, games and errors come back in Hindi — only when asked', async () => {
  const { token } = await register('Bhasha');
  const h = (await api('POST', '/trackers', { type: 'habit', name: 'Read' }, token)).body.tracker.id;
  for (const n of [3, 2, 1]) await api('PUT', `/trackers/${h}/entries/${daysAgo(n)}`, { completed: true, note: 'Read my own notes' }, token);

  // English by default
  let r = await api('GET', '/dashboard', null, token);
  assert.ok(r.body.cards[0].today.alerts.some((a) => a.title.startsWith('🔥 3-day streak at risk')));

  // Hindi when the app asks
  r = await hindi('GET', '/dashboard', null, token);
  const alert = r.body.cards[0].today.alerts.find((a) => a.title.startsWith('🔥'));
  assert.equal(alert.title, '🔥 3 दिन की streak ख़तरे में — पढ़ें');
  assert.equal(alert.message, 'आधी रात से पहले चेक-इन करें, वरना यह शून्य हो जाएगी।');
  assert.ok(r.body.game.achievements.some((a) => a.title === 'पहला क़दम'), 'badge names');
  assert.equal(r.body.user.name, 'Bhasha', 'the member’s own name is never touched');

  // What the member wrote stays exactly as written
  r = await hindi('GET', `/trackers/${h}/entries?period=7d`, null, token);
  assert.ok(r.body.entries.every((e) => e.note === 'Read my own notes'));

  // Games
  r = await hindi('GET', '/dashboard/forest', null, token);
  assert.equal(r.body.stage.name, 'पहला अंकुर');

  // Errors
  r = await hindi('POST', '/auth/login', { email: 'nobody@nowhere.test', password: 'whatever-123' });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.message, 'ईमेल या पासवर्ड ग़लत है');
  assert.equal(r.body.error.code, 'BAD_CREDENTIALS', 'codes stay the same for the app');
  r = await hindi('PUT', `/trackers/${h}/entries/2999-01-01`, { completed: true }, token);
  assert.equal(r.body.error.message, 'आगे की तारीख़ दर्ज नहीं कर सकते');

  // Today is untouched by all this
  assert.equal((await api('GET', `/trackers/${h}/today`, null, token)).body.date, today);
});
