/**
 * Admin → Security (super admins only): blocked IPs, locked accounts, and the security log.
 * Mounted under /api/admin.
 *
 *   GET    /api/admin/security            blocked IPs, locked accounts, top failing IPs (24 h), recent events
 *   POST   /api/admin/security/ips        block an IP or range { target, reason?, hours? }  (no hours = until removed)
 *   DELETE /api/admin/security/ips/:id    unblock
 *
 * Emergency (locked yourself out?):  npm run unblock-ip -- <ip>   on the server.
 */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requirePermission } from '../middleware/auth.js';
import { HttpError, isUuid, parse } from '../middleware/errors.js';
import { audit } from '../services/audit.js';
import { PERMISSIONS as P } from '../services/roles.js';
import { normalizeIp, parseTarget, recordEvent, reloadBlockedIps, targetCovers } from '../services/security.js';

export const adminSecurityRouter = Router();
const guard = requirePermission(P.SECURITY_MANAGE);

adminSecurityRouter.get('/security', guard, async (req, res) => {
  const [blocked, locked, failing, events] = await Promise.all([
    query(
      `SELECT b.id, b.target, b.reason, b.auto, b.expires_at AS "expiresAt", b.created_at AS "createdAt", m.email AS "createdBy"
         FROM blocked_ips b LEFT JOIN members m ON m.id = b.created_by
        WHERE b.expires_at IS NULL OR b.expires_at > now()
        ORDER BY b.created_at DESC`,
    ),
    query(
      `SELECT id, email, name, locked_at AS "lockedAt", lock_reason AS "lockReason", failed_logins AS "failedLogins"
         FROM members WHERE locked_at IS NOT NULL ORDER BY locked_at DESC LIMIT 200`,
    ),
    query(
      `SELECT ip, count(*)::int AS failures, count(DISTINCT email)::int AS accounts, max(created_at) AS "lastAt"
         FROM security_events
        WHERE kind = 'login_failed' AND created_at > now() - interval '24 hours' AND ip IS NOT NULL
        GROUP BY ip ORDER BY failures DESC LIMIT 20`,
    ),
    query(
      `SELECT id, kind, ip, email, detail, created_at AS "createdAt" FROM security_events ORDER BY created_at DESC LIMIT 100`,
    ),
  ]);
  res.json({ yourIp: normalizeIp(req.ip), blocked: blocked.rows, locked: locked.rows, failing: failing.rows, events: events.rows });
});

const blockSchema = z.object({
  target: z.string().trim().min(2).max(64),
  reason: z.string().trim().max(200).optional(),
  /** Block for this many hours; leave out to block until removed */
  hours: z.number().int().min(1).max(24 * 365).optional(),
});

adminSecurityRouter.post('/security/ips', guard, async (req, res) => {
  const body = parse(blockSchema, req.body);
  const t = parseTarget(body.target);
  if (!t) throw new HttpError(400, 'Enter an IP like 203.0.113.7, or a range like 203.0.113.0/24', 'VALIDATION');
  const target = t.prefix === (t.family === 'ipv4' ? 32 : 128) ? t.address : `${t.address}/${t.prefix}`;
  // Never let an admin lock themselves (and everyone on their network) out of the panel
  if (targetCovers(target, req.ip)) throw new HttpError(400, 'That would block your own connection. Use a different IP or range.', 'SELF_BLOCK');

  const { rows } = await query(
    `INSERT INTO blocked_ips (target, reason, auto, expires_at, created_by)
     VALUES ($1, $2, false, CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(hours => $3::int) END, $4)
     ON CONFLICT (target) DO UPDATE SET reason = EXCLUDED.reason, auto = false, expires_at = EXCLUDED.expires_at, created_by = EXCLUDED.created_by
     RETURNING id`,
    [target, body.reason ?? null, body.hours ?? null, req.user.id],
  );
  await reloadBlockedIps();
  await recordEvent('ip_blocked', { ip: target, detail: `by ${req.user.email}${body.reason ? `: ${body.reason}` : ''}` });
  await audit(req, 'security.block_ip', 'ip', target, { reason: body.reason, hours: body.hours ?? null });
  res.status(201).json({ id: rows[0].id, target });
});

adminSecurityRouter.delete('/security/ips/:id', guard, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Not found', 'NOT_FOUND');
  const { rows } = await query('DELETE FROM blocked_ips WHERE id = $1 RETURNING target', [req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Not found', 'NOT_FOUND');
  await reloadBlockedIps();
  await recordEvent('ip_unblocked', { ip: rows[0].target, detail: `by ${req.user.email}` });
  await audit(req, 'security.unblock_ip', 'ip', rows[0].target);
  res.status(204).end();
});
