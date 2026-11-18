import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { DEFAULT_TEMPLATES } from '../services/catalog.js';
import { query } from './pool.js';

/** Idempotent seed: default templates + first admin. Safe to run on every start. */
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

  if (config.adminEmail) await ensureAdmin(config.adminEmail, config.adminPassword, log);
}

export async function ensureAdmin(email, password, log = console.log) {
  const { rows } = await query('SELECT id, role FROM users WHERE email = $1', [email]);
  if (rows[0]) {
    if (rows[0].role !== 'admin') {
      await query(`UPDATE users SET role = 'admin', updated_at = now() WHERE id = $1`, [rows[0].id]);
      log(`admin: promoted ${email}`);
    }
    return;
  }
  if (!password || password.length < 10) {
    log(`admin: ${email} does not exist yet; set ADMIN_PASSWORD (10+ chars) to create it`);
    return;
  }
  await query(
    `INSERT INTO users (email, password_hash, name, role, email_verified_at, terms_version)
     VALUES ($1, $2, 'Admin', 'admin', now(), $3)`,
    [email, await bcrypt.hash(password, 12), config.termsVersion],
  );
  log(`admin: created ${email}`);
}
