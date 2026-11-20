/**
 * Starter packs: a named bundle of templates ("Morning routine" = wake early + water + meditate + journal).
 * One tap in the app creates all of its trackers. Admins manage packs in Admin → Starter packs.
 */
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { DEFAULT_STARTER_PACKS } from './catalog.js';
import { getSettings } from './settings.js';
import { parseConfig } from './trackerConfig.js';

export const PACK_FIELDS = `id, slug, name, emoji, description, template_slugs AS "templateSlugs", sort_order AS "sortOrder", active,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

/** Packs ship with the app; deleting one only hides it (otherwise it would come back on the next start). */
export const isDefaultPack = (slug) => DEFAULT_STARTER_PACKS.some((p) => p.slug === slug);

/** Is this kind of tracker switched on by the admin? */
const typeAllowed = (type, settings) => (type === 'trading' ? settings.feature_trading : type === 'spending' ? settings.feature_spending : true);

/** Active packs with their (active, allowed) templates — what the app shows. Packs left empty are hidden. */
export async function listPublicPacks() {
  const settings = await getSettings();
  const [{ rows: packs }, { rows: templates }] = await Promise.all([
    query(`SELECT slug, name, emoji, description, template_slugs FROM starter_packs WHERE active ORDER BY sort_order, name`),
    query(`SELECT slug, type, category, name, subtitle, icon, color FROM templates WHERE active`),
  ]);
  const bySlug = new Map(templates.filter((t) => typeAllowed(t.type, settings)).map((t) => [t.slug, t]));
  return packs
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      emoji: p.emoji,
      description: p.description,
      trackers: p.template_slugs.map((s) => bySlug.get(s)).filter(Boolean),
    }))
    .filter((p) => p.trackers.length > 0);
}

/**
 * Create a pack's trackers for a member. Skips templates the member already uses (no duplicates)
 * and respects the admin's tracker limit. Returns { created: [rows], skipped: n }.
 */
export async function applyPack(userId, slug) {
  const settings = await getSettings();
  const { rows: packs } = await query(`SELECT template_slugs FROM starter_packs WHERE slug = $1 AND active`, [slug]);
  if (!packs[0]) throw new HttpError(404, 'That starter pack is not available', 'NOT_FOUND');

  const [{ rows: templates }, { rows: existing }] = await Promise.all([
    query(`SELECT slug, type, category, name, icon, color, config FROM templates WHERE active AND slug = ANY($1::text[])`, [packs[0].template_slugs]),
    query(`SELECT template_slug, count(*) OVER () AS total FROM trackers WHERE user_id = $1`, [userId]),
  ]);
  const owned = new Set(existing.map((r) => r.template_slug).filter(Boolean));
  let total = Number(existing[0]?.total ?? 0);

  const wanted = packs[0].template_slugs
    .map((s) => templates.find((t) => t.slug === s))
    .filter((t) => t && typeAllowed(t.type, settings) && !owned.has(t.slug));
  if (!wanted.length) throw new HttpError(400, 'You already have everything in this pack', 'NOTHING_TO_ADD');
  if (total + wanted.length > settings.max_trackers_per_member)
    throw new HttpError(400, `This pack would take you over the limit of ${settings.max_trackers_per_member} trackers. Archive or delete some first.`, 'LIMIT');

  const created = [];
  for (const t of wanted) {
    const cfg = parseConfig(t.type, t.config); // fills in every default
    const { rows } = await query(
      `INSERT INTO trackers (user_id, type, category, name, icon, color, config, template_slug, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [userId, t.type, t.category, t.name, t.icon, t.color, JSON.stringify(cfg), t.slug, ++total],
    );
    created.push(rows[0]);
  }
  return { created, skipped: packs[0].template_slugs.length - created.length };
}
