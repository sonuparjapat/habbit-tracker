/**
 * Admin → Sync: changes members made while the server was unreachable.
 * Mounted under /api/admin. Normally everything is applied automatically; this is for the rare stuck one.
 *
 *   GET  /api/admin/sync                 counts by status + the changes that need attention (?status=)
 *   POST /api/admin/sync/retry-all       retry every failed / dead change now
 *   POST /api/admin/sync/:id/retry       try one again now
 *   POST /api/admin/sync/:id/discard     give up on one (it stays in the list as "discarded")
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requirePermission } from '../middleware/auth.js';
import { HttpError, isUuid, parse } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { PERMISSIONS as P } from '../services/roles.js';
import { retryDueOps, retryOpNow } from '../services/sync.js';

export const adminSyncRouter = Router();
const guard = requirePermission(P.SYSTEM_VIEW);

const STATUSES = ['failed', 'dead', 'rejected', 'pending', 'applied', 'superseded', 'discarded'];
const NEEDS_ATTENTION = ['failed', 'dead', 'rejected'];

adminSyncRouter.get('/sync', guard, async (req, res) => {
  const q = parse(z.object({ status: z.enum(STATUSES).optional() }), req.query);
  const [counts, ops] = await Promise.all([
    query(`SELECT status, count(*)::int AS n FROM sync_ops WHERE created_at > now() - interval '30 days' GROUP BY status`),
    query(
      `SELECT s.id, s.method, s.path, s.body, s.status, s.attempts, s.last_error AS "lastError", s.next_attempt_at AS "nextAttemptAt",
              s.client_created_at AS "madeAt", s.created_at AS "receivedAt", s.applied_at AS "appliedAt", m.email
         FROM sync_ops s JOIN members m ON m.id = s.user_id
        WHERE s.status = ANY($1::text[])
        ORDER BY s.created_at DESC LIMIT 200`,
      [q.status ? [q.status] : NEEDS_ATTENTION],
    ),
  ]);
  res.json({ counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])), ops: ops.rows });
});

adminSyncRouter.post('/sync/retry-all', guard, async (req, res) => {
  await query(`UPDATE sync_ops SET status = 'failed', attempts = 0, next_attempt_at = now() WHERE status IN ('failed', 'dead')`);
  const result = await retryDueOps(500);
  await audit(req, 'sync.retry_all', 'sync', null, result);
  res.json({ result });
});

adminSyncRouter.post('/sync/:id/retry', guard, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Not found', 'NOT_FOUND');
  const status = await retryOpNow(req.params.id);
  await audit(req, 'sync.retry', 'sync_op', req.params.id, { status });
  res.json({ status });
});

adminSyncRouter.post('/sync/:id/discard', guard, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Not found', 'NOT_FOUND');
  const { rows } = await query(
    `UPDATE sync_ops SET status = 'discarded' WHERE id = $1 AND status = ANY($2::text[]) RETURNING id`,
    [req.params.id, [...NEEDS_ATTENTION, 'pending']],
  );
  if (!rows[0]) throw new HttpError(400, 'Only changes that are not yet applied can be discarded', 'NOT_DISCARDABLE');
  await audit(req, 'sync.discard', 'sync_op', req.params.id);
  res.json({ status: 'discarded' });
});
