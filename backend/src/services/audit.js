import { query } from '../db/pool.js';

/** Record an admin action (shown in Admin → Audit log). */
export async function audit(req, action, targetType, targetId, meta = {}) {
  await query(
    `INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, meta) VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user.id, req.user.email, action, targetType, targetId == null ? null : String(targetId), JSON.stringify(meta)],
  );
}
