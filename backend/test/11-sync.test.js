/**
 * Offline sync: changes made on the phone while the server was asleep must never be lost,
 * never applied twice, and an old change must never overwrite a newer one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { query } from '../src/db/pool.js';
import { retryDueOps } from '../src/services/sync.js';
import { api, daysAgo, login, register, today } from './helpers.js';

let n = 0;
const opId = () => `op-${Date.now()}-${n++}`;
const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const doneToday = async (token, trackerId) => (await api('GET', `/trackers/${trackerId}/today`, null, token)).body.completedToday;

test('sync: changes are applied once, in order, and the newest always wins', async () => {
  const { token } = await register('Offline');
  const h = (await api('POST', '/trackers', { type: 'habit', name: 'Walk' }, token)).body.tracker.id;
  const entry = `/trackers/${h}/entries/${today}`;

  // A check-in made offline
  const first = { id: opId(), method: 'PUT', path: entry, body: { completed: true }, at: at(10) };
  let r = await api('POST', '/sync', { ops: [first] }, token);
  assert.equal(r.status, 200);
  assert.equal(r.body.results[0].status, 'applied');
  assert.equal(await doneToday(token, h), true);

  // The phone sends it again (it never got the reply) → stored once, not applied twice
  r = await api('POST', '/sync', { ops: [first] }, token);
  assert.equal(r.body.results[0].status, 'applied');
  assert.equal(r.body.results[0].duplicate, true);
  const { rows } = await query('SELECT count(*)::int AS n FROM sync_ops WHERE client_op_id = $1', [first.id]);
  assert.equal(rows[0].n, 1);

  // Two changes arrive out of order: "undo" (made later) must win over "check in" (made earlier)
  const undo = { id: opId(), method: 'DELETE', path: entry, at: at(2) };
  const checkIn = { id: opId(), method: 'PUT', path: entry, body: { completed: true }, at: at(5) };
  r = await api('POST', '/sync', { ops: [undo, checkIn] }, token);
  assert.deepEqual(r.body.results.map((x) => x.status), ['applied', 'applied'], 'replies keep the app’s order');
  assert.equal(await doneToday(token, h), false, 'applied in the order they were made: check-in, then undo');

  // A very old change arriving late is skipped, so it can't overwrite the newer undo
  r = await api('POST', '/sync', { ops: [{ id: opId(), method: 'PUT', path: entry, body: { completed: true }, at: at(60) }] }, token);
  assert.equal(r.body.results[0].status, 'superseded');
  assert.equal(await doneToday(token, h), false);

  // Back-filling yesterday works too
  r = await api('POST', '/sync', { ops: [{ id: opId(), method: 'PUT', path: `/trackers/${h}/entries/${daysAgo(1)}`, body: { completed: true }, at: at(1) }] }, token);
  assert.equal(r.body.results[0].status, 'applied');
});

test('sync: changes that can never work are rejected (and not retried)', async () => {
  const { token } = await register('Rejects');
  const other = await register('Other');
  const theirs = (await api('POST', '/trackers', { type: 'habit', name: 'Theirs' }, other.token)).body.tracker.id;
  const mine = (await api('POST', '/trackers', { type: 'habit', name: 'Mine' }, token)).body.tracker.id;

  const r = await api(
    'POST',
    '/sync',
    {
      ops: [
        { id: opId(), method: 'PUT', path: `/trackers/${theirs}/entries/${today}`, body: { completed: true }, at: at(3) }, // someone else's tracker
        { id: opId(), method: 'PUT', path: `/trackers/${mine}/entries/2999-01-01`, body: { completed: true }, at: at(3) }, // the future
        { id: opId(), method: 'POST', path: '/trackers', body: { type: 'habit', name: 'x' }, at: at(3) }, // not allowed offline
        { id: opId(), method: 'PUT', path: `/trackers/${mine}/entries/${today}`, body: { mood: 9 }, at: at(3) }, // invalid
      ],
    },
    token,
  );
  assert.deepEqual(r.body.results.map((x) => x.status), ['rejected', 'rejected', 'rejected', 'rejected']);
  assert.ok(r.body.results.every((x) => x.error), 'each rejection says why');
  assert.equal((await api('GET', `/trackers/${theirs}/today`, null, other.token)).body.completedToday, false, 'never touches another member’s data');

  // Bad requests to the sync endpoint itself
  assert.equal((await api('POST', '/sync', { ops: [] }, token)).status, 400);
  assert.equal((await api('POST', '/sync', { ops: [{ id: 'x', method: 'PUT', path: '/a', at: 'yesterday' }] }, token)).status, 400);
  assert.equal((await api('POST', '/sync', { ops: [{ id: opId(), method: 'PUT', path: '/a', at: at(1) }] })).status, 401, 'needs sign-in');
});

test('sync: weekly review answers and "badges seen" sync too', async () => {
  const { token } = await register('Synced');
  const monday = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const r = await api(
    'POST',
    '/sync',
    {
      ops: [
        { id: opId(), method: 'PUT', path: '/dashboard/review', body: { weekStart: monday, wentWell: 'Offline answer' }, at: at(2) },
        { id: opId(), method: 'POST', path: '/dashboard/achievements/seen', at: at(1) },
      ],
    },
    token,
  );
  assert.deepEqual(r.body.results.map((x) => x.status), ['applied', 'applied']);
  assert.equal((await api('GET', `/dashboard/review?week=${monday}`, null, token)).body.answers.wentWell, 'Offline answer');
});

test('sync: temporary failures are retried by the background job; admins can retry or discard', async () => {
  const me = await register('Retry');
  const h = (await api('POST', '/trackers', { type: 'habit', name: 'Read' }, me.token)).body.tracker.id;

  // A change that failed earlier for a temporary reason (e.g. the database was restarting)
  const { rows } = await query(
    `INSERT INTO sync_ops (user_id, client_op_id, method, path, body, resource_key, client_created_at, status, attempts, last_error, next_attempt_at)
     VALUES ($1, $2, 'PUT', $3, $4, $5, now(), 'failed', 1, 'connection reset', now() - interval '1 minute') RETURNING id`,
    [me.user.id, opId(), `/trackers/${h}/entries/${today}`, JSON.stringify({ completed: true }), `entry:${h}:${today}`],
  );
  const counts = await retryDueOps();
  assert.ok(counts.applied >= 1, JSON.stringify(counts));
  assert.equal(await doneToday(me.token, h), true, 'the background job applied it');
  const { rows: after } = await query('SELECT status FROM sync_ops WHERE id = $1', [rows[0].id]);
  assert.equal(after[0].status, 'applied');

  // Admin view: only super admins (system permission)
  const staff = (await login('staff@test.local', 'adminpass123')).token;
  assert.equal((await api('GET', '/admin/sync', null, staff)).status, 403);
  const admin = (await login('admin@test.local', 'adminpass123')).token;

  // A rejected change shows up for admins; retrying it fails the same way; discarding works
  const bad = await api('POST', '/sync', { ops: [{ id: opId(), method: 'PUT', path: `/trackers/${h}/entries/2999-01-01`, body: { completed: true }, at: at(1) }] }, me.token);
  assert.equal(bad.body.results[0].status, 'rejected');
  let r = await api('GET', '/admin/sync', null, admin);
  assert.equal(r.status, 200);
  const stuck = r.body.ops.find((o) => o.path.endsWith('2999-01-01'));
  assert.ok(stuck && stuck.email === me.email && stuck.lastError);
  assert.ok(r.body.counts.rejected >= 1 && r.body.counts.applied >= 1);
  r = await api('POST', `/admin/sync/${stuck.id}/retry`, null, admin);
  assert.equal(r.body.status, 'rejected', 'still impossible');
  r = await api('POST', `/admin/sync/${stuck.id}/discard`, null, admin);
  assert.equal(r.body.status, 'discarded');
  assert.equal((await api('POST', `/admin/sync/${stuck.id}/discard`, null, admin)).status, 400, 'only once');
  r = await api('POST', '/admin/sync/retry-all', null, admin);
  assert.equal(r.status, 200);
  r = await api('GET', '/admin/audit-logs', null, admin);
  assert.ok(['sync.retry', 'sync.discard', 'sync.retry_all'].every((a) => r.body.logs.some((l) => l.action === a)));
});
