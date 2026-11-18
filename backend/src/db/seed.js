import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { DEFAULT_TEMPLATES } from '../services/catalog.js';
import { ROLE_LABELS, ROLES } from '../services/roles.js';
import { query } from './pool.js';

/** Idempotent seed: default templates. Safe to run on every start. */
export async function seed({ log = console.log } = {}) {
  let inserted = 0;
  for (const [i, t] of DEFAULT_TEMPLATES.entries()) {
    const { rowCount } = await query(
      `INSERT INTO templates (slug, category, type, name, subtitle, icon, color, config, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (slug) DO NOTHING`,
      [t.slug, t.category, t.type, t.name, t.subtitle, t.icon, t.color, JSON.stringify(t.config), i],
    );
    inserted += rowCount;
  }
  if (inserted) log(`db: seeded ${inserted} templates`);

  const { rows } = await query(`SELECT count(*) AS n FROM members WHERE role = $1`, [ROLES.SUPER_ADMIN]);
  if (rows[0].n === 0) log('admin: no super admin yet — create one with: npm run create-admin -- you@example.com "strong-password"');
}

/**
 * Create a staff account, or change an existing user's role.
 * Used by `npm run create-admin` — the only way to create a super admin.
 */
export async function upsertStaff({ email, password, role = ROLES.SUPER_ADMIN, name = 'Admin' }, log = console.log) {
  const { rows } = await query('SELECT id, role FROM members WHERE email = $1', [email]);
  if (rows[0]) {
    await query(`UPDATE members SET role = $2, status = 'active', updated_at = now() WHERE id = $1`, [rows[0].id, role]);
    if (password) {
      await query('UPDATE members SET password_hash = $2, token_version = token_version + 1 WHERE id = $1', [rows[0].id, await bcrypt.hash(password, 12)]);
    }
    log(`✓ ${email} is now: ${ROLE_LABELS[role]}${password ? ' (password updated)' : ''}`);
    return;
  }
  if (!password || password.length < 10) throw new Error('A new account needs a password of at least 10 characters');
  await query(
    `INSERT INTO members (email, password_hash, name, role, email_verified_at, terms_version)
     VALUES ($1, $2, $3, $4, now(), $5)`,
    [email, await bcrypt.hash(password, 12), name, role, config.termsVersion],
  );
  log(`✓ Created ${ROLE_LABELS[role]}: ${email}`);
}
