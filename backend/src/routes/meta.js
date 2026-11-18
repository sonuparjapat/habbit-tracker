import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { CATEGORIES, EMOTIONS, MARKETS } from '../services/catalog.js';

/** Public, cacheable data the app needs before (or without) signing in. */
export const metaRouter = Router();

metaRouter.get('/meta', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    appName: config.appName,
    termsVersion: config.termsVersion,
    categories: CATEGORIES,
    markets: MARKETS,
    emotions: EMOTIONS,
  });
});

metaRouter.get('/templates', async (_req, res) => {
  const { rows } = await query(
    `SELECT slug, category, type, name, subtitle, icon, color, config
       FROM templates WHERE active ORDER BY sort_order, name`,
  );
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ templates: rows });
});
