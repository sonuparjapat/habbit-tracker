/**
 * Offline sync — so members never wait for the server and never lose a change.
 *
 * The app saves a change on the phone first (its "outbox") and shows it straight away. When the
 * server is reachable, the app sends its outbox to POST /api/sync. Here each change is:
 *   1. STORED first (sync_ops). The same change sent twice is stored once (client_op_id).
 *   2. APPLIED with the very same code the normal API uses.
 *        applied     → done
 *        rejected    → it can never work (e.g. the tracker was deleted). Not retried; shown in Admin → Sync.
 *        failed      → a temporary problem (e.g. database hiccup). Retried by the background job with
 *                      growing waits; after MAX_ATTEMPTS it becomes "dead" and waits for an admin.
 *        superseded  → a NEWER change to the same thing already arrived; the old one is skipped,
 *                      so an old offline change can never overwrite a newer one.
 *
 * Only safe, repeatable actions go through sync (check-ins, journals, weekly review answers, "badges seen").
 * Sign-in, trades and expenses always go to the server live, because the server must judge them right then.
 */
import { z } from 'zod';
import { query } from '../db/pool.js';
import { USER_FIELDS } from '../middleware/auth.js';
import { HttpError, parse } from '../middleware/errors.js';
import { todayIn } from '../utils/date.js';
import { dateStr } from '../utils/validation.js';
import { deleteEntry, upsertEntry } from './entries.js';
import { markAchievementsSeen } from './gamification.js';
import { assertReviewableWeek, saveReviewAnswers } from './weeklyReview.js';

export const MAX_ATTEMPTS = 10;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DATE = '\\d{4}-\\d{2}-\\d{2}';

const reviewSchema = z.object({
  weekStart: dateStr,
  wentWell: z.string().trim().max(1000).optional(),
  hard: z.string().trim().max(1000).optional(),
  nextFocus: z.string().trim().max(1000).optional(),
});

/**
 * The only changes allowed through sync. Each: which request it is, what it changes (resource key),
 * and how to apply it (the same code as the normal API).
 */
const OPERATIONS = [
  {
    method: 'PUT',
    pattern: new RegExp(`^/trackers/(${UUID})/entries/(${DATE})$`, 'i'),
    key: (m) => `entry:${m[1]}:${m[2]}`,
    apply: (user, m, body) => upsertEntry(user, m[1], m[2], body ?? {}),
  },
  {
    method: 'DELETE',
    pattern: new RegExp(`^/trackers/(${UUID})/entries/(${DATE})$`, 'i'),
    key: (m) => `entry:${m[1]}:${m[2]}`, // same key as PUT: "check in" and "undo" of one day compete — newest wins
    apply: (user, m) => deleteEntry(user, m[1], m[2]),
  },
  {
    method: 'PUT',
    pattern: /^\/dashboard\/review$/,
    key: (_m, body) => `review:${body?.weekStart}`,
    apply: async (user, _m, body) => {
      const { weekStart, ...answers } = parse(reviewSchema, body ?? {});
      assertReviewableWeek(weekStart, todayIn(user.timezone));
      if (!Object.values(answers).some(Boolean)) throw new HttpError(400, 'Write at least one answer', 'VALIDATION');
      await saveReviewAnswers(user.id, weekStart, answers);
    },
  },
  {
    method: 'POST',
    pattern: /^\/dashboard\/achievements\/seen$/,
    key: () => 'achievements:seen',
    apply: (user) => markAchievementsSeen(user.id),
  },
];

/** Which operation is this request? Throws 400 if it isn't allowed through sync. */
export function matchOperation(method, path) {
  for (const op of OPERATIONS) {
    if (op.method !== method) continue;
    const m = path.match(op.pattern);
    if (m) return { op, m };
  }
  throw new HttpError(400, `${method} ${path} can't be synced offline`, 'NOT_SYNCABLE');
}

/** Wait before the next retry: 1, 2, 4, 8… minutes, never more than an hour. */
const backoffMinutes = (attempts) => Math.min(60, 2 ** Math.max(0, attempts - 1));

async function loadMember(userId) {
  const { rows } = await query(`SELECT ${USER_FIELDS} FROM members WHERE id = $1`, [userId]);
  return rows[0];
}

/** Apply one stored change and record the outcome. Returns the new status. */
export async function applyStoredOp(row) {
  // An older change must never overwrite a newer one that already arrived
  const { rows: newer } = await query(
    `SELECT 1 FROM sync_ops
      WHERE user_id = $1 AND resource_key = $2 AND id <> $3 AND client_created_at > $4 AND status = 'applied' LIMIT 1`,
    [row.user_id, row.resource_key, row.id, row.client_created_at],
  );
  if (newer[0]) return finish(row, 'superseded', null);

  const member = await loadMember(row.user_id);
  if (!member || member.status !== 'active') return finish(row, 'rejected', 'The account is no longer active');

  try {
    const { op, m } = matchOperation(row.method, row.path);
    await op.apply(member, m, row.body);
    return finish(row, 'applied', null);
  } catch (err) {
    // A 4xx means the change itself can never work → don't retry. Anything else is temporary → retry later.
    if (err instanceof HttpError && err.status < 500) return finish(row, 'rejected', err.message);
    const attempts = row.attempts + 1;
    const status = attempts >= MAX_ATTEMPTS ? 'dead' : 'failed';
    await query(
      `UPDATE sync_ops SET status = $2, attempts = $3, last_error = $4,
         next_attempt_at = now() + make_interval(mins => $5) WHERE id = $1`,
      [row.id, status, attempts, String(err?.message ?? err).slice(0, 500), backoffMinutes(attempts)],
    );
    return status;
  }
}

async function finish(row, status, error) {
  await query(
    `UPDATE sync_ops SET status = $2, last_error = $3, attempts = attempts + 1,
       applied_at = CASE WHEN $2 = 'applied' THEN now() ELSE applied_at END WHERE id = $1`,
    [row.id, status, error],
  );
  return status;
}

/**
 * Store and apply a batch from the app, in the order the member made them.
 * ops: [{ id, method, path, body, at }] → [{ id, status, error? }]
 */
export async function syncBatch(user, ops) {
  const results = [];
  const sorted = [...ops].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const op of sorted) {
    let match;
    try {
      match = matchOperation(op.method, op.path);
    } catch (err) {
      results.push({ id: op.id, status: 'rejected', error: err.message });
      continue;
    }
    // 1. Store it (once — a resend of the same change returns what happened the first time)
    const { rows } = await query(
      `INSERT INTO sync_ops (user_id, client_op_id, method, path, body, resource_key, client_created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, client_op_id) DO NOTHING RETURNING *`,
      [user.id, op.id, op.method, op.path, op.body === undefined ? null : JSON.stringify(op.body), match.op.key(match.m, op.body), op.at],
    );
    if (!rows[0]) {
      const { rows: existing } = await query('SELECT status, last_error FROM sync_ops WHERE user_id = $1 AND client_op_id = $2', [user.id, op.id]);
      results.push({ id: op.id, status: existing[0].status, error: existing[0].last_error ?? undefined, duplicate: true });
      continue;
    }
    // 2. Apply it
    const status = await applyStoredOp(rows[0]);
    const { rows: after } = await query('SELECT last_error FROM sync_ops WHERE id = $1', [rows[0].id]);
    results.push({ id: op.id, status, error: status === 'applied' || status === 'superseded' ? undefined : (after[0].last_error ?? undefined) });
  }
  // Keep the app's own order in the reply
  return ops.map((op) => results.find((r) => r.id === op.id));
}

/**
 * Background job: retry changes that failed for a temporary reason. Safe with several servers:
 * each server claims a batch (FOR UPDATE SKIP LOCKED) so no change is applied twice at once.
 */
export async function retryDueOps(limit = 50) {
  const { rows } = await query(
    `UPDATE sync_ops SET next_attempt_at = now() + interval '5 minutes'
      WHERE id IN (
        SELECT id FROM sync_ops WHERE status IN ('failed', 'pending') AND next_attempt_at <= now()
        ORDER BY client_created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [limit],
  );
  const counts = { retried: rows.length, applied: 0, failed: 0, rejected: 0, superseded: 0, dead: 0 };
  for (const row of rows.sort((a, b) => a.client_created_at - b.client_created_at)) {
    const status = await applyStoredOp(row);
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

/** Housekeeping: finished changes are only needed for a while. */
export async function cleanupOps() {
  await query(`DELETE FROM sync_ops WHERE status IN ('applied', 'superseded', 'discarded') AND created_at < now() - interval '30 days'`);
}

/** Admin: put a change back in the retry queue right away (and run it). */
export async function retryOpNow(id) {
  const { rows } = await query(
    `UPDATE sync_ops SET status = 'failed', next_attempt_at = now(), attempts = 0
      WHERE id = $1 AND status IN ('failed', 'dead', 'rejected') RETURNING *`,
    [id],
  );
  if (!rows[0]) throw new HttpError(400, 'Only failed, dead or rejected changes can be retried', 'NOT_RETRYABLE');
  return applyStoredOp(rows[0]);
}
