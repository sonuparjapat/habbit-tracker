/**
 * Paging + search for admin lists, the same everywhere:
 *
 *   ?page=2&limit=25&q=text
 *
 *   const p = listParams(req.query);                       // { page, limit, offset, q, like }
 *   ...WHERE ... ILIKE $1 ... LIMIT ${p.limit} OFFSET ${p.offset}   (both are validated whole numbers)
 *   res.json({ items: rows, ...pageInfo(total, p) });      // { total, page, limit, pages }
 */
import { z } from 'zod';
import { parse } from '../middleware/errors.js';

const schema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).default(''),
});

export function listParams(query) {
  const { page, limit, q } = parse(schema, { page: query.page, limit: query.limit, q: query.q ?? '' });
  // For ILIKE: escape % and _ so a search for "50%" means the text "50%", not a wildcard
  const like = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return { page, limit, offset: (page - 1) * limit, q, like };
}

export function pageInfo(total, { page, limit }) {
  const n = Number(total) || 0;
  return { total: n, page, limit, pages: Math.max(1, Math.ceil(n / limit)) };
}
