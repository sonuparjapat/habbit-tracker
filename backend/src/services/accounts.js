/**
 * Deleting an account (by the member, or by an admin).
 *
 * Almost everything is removed automatically by the database (ON DELETE CASCADE).
 * Two tables keep their rows for the admin — feedback and the security log — so here we also
 * blank the email address on those rows. After this nothing in the database can identify the person.
 */
import { withTransaction } from '../db/pool.js';

export async function deleteMember(id) {
  await withTransaction(async (db) => {
    await db.query('UPDATE feedback SET email = NULL WHERE user_id = $1', [id]);
    await db.query('UPDATE security_events SET email = NULL WHERE user_id = $1', [id]);
    await db.query('DELETE FROM members WHERE id = $1', [id]);
  });
}
