/**
 * Evening check-in.
 *
 * Every few minutes the server looks for members who:
 *   1. switched on evening nudges (push and/or email) in the app, and
 *   2. have reached the check hour (Admin → App settings, default 20:00) in THEIR timezone, and
 *   3. haven't been checked yet today.
 *
 * For each, it looks only at trackers that have a reminder set (that's how a member opts a tracker in):
 *   - habit scheduled today, not checked in              → missed
 *   - trading journal reminder set, trading day, no journal → missed
 * Money trackers are skipped: a no-spend day has nothing to log, so we'd only be nagging.
 *
 * Missed something → one push and/or one email listing what's left.
 * Logged everything → nothing is sent. Either way the member is marked as checked for today,
 * so nobody ever gets two nudges in a day — even with several servers running.
 */
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { sendNudgeEmail } from './email.js';
import { push } from './push.js';
import { getSettings } from './settings.js';
import { parseConfig } from './trackerConfig.js';
import { dateIn, weekdayOf } from '../utils/date.js';

/** The hour (0–23) it is right now in a timezone. */
function hourIn(now, timeZone) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(now));
  } catch {
    return now.getUTCHours();
  }
}

/** Names of the opted-in trackers this member hasn't logged today. */
export async function missedTrackers(userId, date) {
  const weekday = weekdayOf(date);
  const { rows } = await query(
    `SELECT t.type, t.name, t.config, de.completed AS "done", (de.id IS NOT NULL) AS "logged"
       FROM trackers t
       LEFT JOIN daily_entries de ON de.tracker_id = t.id AND de.entry_date = $2
      WHERE t.user_id = $1 AND NOT t.archived AND t.type IN ('habit', 'trading')
      ORDER BY t.sort_order, t.created_at`,
    [userId, date],
  );
  const missed = [];
  for (const t of rows) {
    const cfg = parseConfig(t.type, t.config);
    if (t.type === 'habit') {
      if (!cfg.reminderTime || !cfg.days.includes(weekday)) continue;
      // A limit habit counts as logged once a number was entered (even if over the limit)
      const logged = cfg.kind === 'limit' ? t.logged : t.done;
      if (!logged) missed.push(t.name);
    } else {
      if (!cfg.journalReminder || !cfg.tradingDays.includes(weekday)) continue;
      if (!t.done) missed.push(`${t.name} — journal`);
    }
  }
  return missed;
}

/** Result of the last run, shown in Admin → System. */
export let lastNudgeRun = null;

export async function runNudges(now = new Date()) {
  const settings = await getSettings();
  const summary = { at: now.toISOString(), checked: 0, nudged: 0, pushes: 0, emails: 0, errors: 0 };
  if (!settings.nudge_enabled) {
    lastNudgeRun = { ...summary, skipped: 'switched off' };
    return lastNudgeRun;
  }
  const emailOn = settings.nudge_email_enabled && !config.email.problem;

  // Everyone who opted in and hasn't been checked in the last day or so (exact local date checked below)
  const { rows: members } = await query(
    `SELECT id, email, name, timezone, push_token, nudge_push, nudge_email,
            (email_verified_at IS NOT NULL) AS verified, to_char(nudge_checked_on, 'YYYY-MM-DD') AS checked_on
       FROM members
      WHERE status = 'active' AND (nudge_push OR nudge_email)
        AND (nudge_checked_on IS NULL OR nudge_checked_on < (now() AT TIME ZONE 'UTC')::date + 1)`,
  );

  for (const m of members) {
    const today = dateIn(now, m.timezone);
    if (m.checked_on === today || hourIn(now, m.timezone) < settings.nudge_hour) continue;

    // Claim this member for today first, so two servers can never both nudge them
    const claim = await query(
      `UPDATE members SET nudge_checked_on = $2 WHERE id = $1 AND nudge_checked_on IS DISTINCT FROM $2::date RETURNING id`,
      [m.id, today],
    );
    if (!claim.rows[0]) continue;
    summary.checked++;

    try {
      const missed = await missedTrackers(m.id, today);
      if (!missed.length) continue; // all done — stay quiet
      summary.nudged++;

      const title = missed.length === 1 ? `Don’t forget: ${missed[0]}` : `${missed.length} things left for today`;
      const body =
        missed.length === 1
          ? 'A few seconds now keeps your streak alive. 🔥'
          : `${missed.slice(0, 3).join(', ')}${missed.length > 3 ? '…' : ''}. Keep your streak alive! 🔥`;

      if (m.nudge_push && m.push_token) {
        const [result] = await push.send([{ to: m.push_token, title, body, data: { url: '/' } }]);
        if (result.ok) summary.pushes++;
        else {
          summary.errors++;
          if (result.unregistered) await query('UPDATE members SET push_token = NULL WHERE id = $1', [m.id]);
        }
      }
      if (m.nudge_email && m.verified && emailOn) {
        await sendNudgeEmail(m.email, m.name, missed);
        summary.emails++;
      }
    } catch (err) {
      summary.errors++;
      console.error('nudge failed for a member:', err.message);
    }
  }

  lastNudgeRun = summary;
  return summary;
}
