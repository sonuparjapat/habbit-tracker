/**
 * Daily check-ins and journals. Used by the normal API (routes/trackers.js) and by offline sync
 * (services/sync.js), so a change made offline is applied exactly the same way when it arrives.
 */
import { z } from 'zod';
import { query } from '../db/pool.js';
import { HttpError, parse } from '../middleware/errors.js';
import { todayIn } from '../utils/date.js';
import { dateStr } from '../utils/validation.js';
import { isComplete } from './habitStats.js';
import { parseConfig } from './trackerConfig.js';
import { getTracker } from './trackers.js';

export const entrySchema = z.object({
  value: z.number().min(0).max(1e7).optional(),
  completed: z.boolean().optional(),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
  reflection: z
    .object({
      wentWell: z.string().max(2000).optional(),
      mistakes: z.string().max(2000).optional(),
      lesson: z.string().max(2000).optional(),
      followedPlan: z.boolean().optional(),
      marketView: z.string().max(2000).optional(),
    })
    .optional(),
});

/**
 * Check in for a day (create or update). Only the fields sent are changed; the rest keep their saved value.
 * Returns the saved entry.
 */
export async function upsertEntry(user, trackerId, rawDate, rawBody) {
  const t = await getTracker(user.id, trackerId);
  const date = parse(dateStr, rawDate);
  if (date > todayIn(user.timezone)) throw new HttpError(400, 'Cannot log a future day', 'FUTURE_DATE');
  const body = parse(entrySchema, rawBody);

  const { rows: existingRows } = await query(
    'SELECT value, completed, mood, note, reflection FROM daily_entries WHERE tracker_id = $1 AND entry_date = $2',
    [t.id, date],
  );
  const existing = existingRows[0] ?? { value: 0, completed: false, mood: null, note: null, reflection: {} };
  const value = body.value ?? existing.value;
  const reflection = body.reflection ? { ...existing.reflection, ...body.reflection } : existing.reflection;
  const mood = body.mood === undefined ? existing.mood : body.mood;
  const note = body.note === undefined ? existing.note : body.note;

  // Is the day "done"? Habits: decided by the goal (e.g. 8 glasses ≥ 8). Journals: something was written.
  let completed = body.completed ?? existing.completed;
  if (t.type === 'habit') completed = isComplete(parseConfig('habit', t.config), value, completed, true);
  else completed = Boolean(reflection.wentWell || reflection.mistakes || reflection.lesson || body.completed);

  const { rows } = await query(
    `INSERT INTO daily_entries (tracker_id, user_id, entry_date, value, completed, mood, note, reflection)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tracker_id, entry_date) DO UPDATE SET
       value = EXCLUDED.value, completed = EXCLUDED.completed, mood = EXCLUDED.mood,
       note = EXCLUDED.note, reflection = EXCLUDED.reflection, updated_at = now()
     RETURNING entry_date AS date, value, completed, mood, note, reflection`,
    [t.id, user.id, date, value, completed, mood, note, JSON.stringify(reflection)],
  );
  return rows[0];
}

/** Undo a check-in for a day. */
export async function deleteEntry(user, trackerId, rawDate) {
  const t = await getTracker(user.id, trackerId);
  const date = parse(dateStr, rawDate);
  await query('DELETE FROM daily_entries WHERE tracker_id = $1 AND entry_date = $2', [t.id, date]);
}
