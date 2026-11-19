/**
 * Notifications admins send to members' phones (Admin → Notifications), like shopping apps do.
 *
 * Who can receive one: active members whose phone allowed notifications (we have a push token)
 * and who kept "News & tips" switched on in Profile. Optionally narrowed to an audience:
 *   all       everyone reachable
 *   interest  members who picked a focus area (e.g. fitness)
 *   inactive  members who haven't opened the app for N days (win-back)
 *   member    one specific member, by email (e.g. a personal message from support)
 */
import { query } from '../db/pool.js';
import { push } from './push.js';

/** App screens a notification may open when tapped. */
export const PUSH_LINKS = {
  '/': 'Today',
  '/games': 'Arcade',
  '/forest': 'Your forest',
  '/achievements': 'Level & badges',
  '/tracker/new': 'New tracker',
  '/insights': 'Insights',
  '/feedback': 'Send feedback',
};

/** SQL WHERE clause + params for an audience. */
function audienceFilter(audience) {
  const where = [`status = 'active'`, 'push_token IS NOT NULL', 'push_news'];
  const params = [];
  if (audience.kind === 'interest') where.push(`$${params.push(audience.interest)} = ANY(interests)`);
  if (audience.kind === 'member') where.push(`email = $${params.push(audience.email)}`);
  if (audience.kind === 'inactive') where.push(`(last_active_at IS NULL OR last_active_at < now() - make_interval(days => $${params.push(audience.days)}))`);
  return { where: where.join(' AND '), params };
}

/** How many members a notification would reach. */
export async function countAudience(audience) {
  const { where, params } = audienceFilter(audience);
  const { rows } = await query(`SELECT count(*)::int AS n FROM members WHERE ${where}`, params);
  return rows[0].n;
}

/**
 * Send a notification. `onlyTo` = a member id for a test send (to the admin themself).
 * Returns { recipients, delivered, failed }.
 */
export async function broadcast({ title, body, link, audience, onlyTo }) {
  let rows;
  if (onlyTo) {
    ({ rows } = await query('SELECT id, push_token FROM members WHERE id = $1 AND push_token IS NOT NULL', [onlyTo]));
  } else {
    const { where, params } = audienceFilter(audience);
    ({ rows } = await query(`SELECT id, push_token FROM members WHERE ${where}`, params));
  }

  const results = await push.send(
    rows.map((m) => ({ to: m.push_token, title, body, channelId: 'updates', data: link ? { url: link } : {} })),
  );

  // Forget phones where the app was uninstalled
  const gone = rows.filter((_, i) => results[i]?.unregistered).map((m) => m.id);
  if (gone.length) await query('UPDATE members SET push_token = NULL WHERE id = ANY($1::uuid[])', [gone]);

  const delivered = results.filter((r) => r.ok).length;
  return { recipients: rows.length, delivered, failed: rows.length - delivered };
}
