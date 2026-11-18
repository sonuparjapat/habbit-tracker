import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { optionalAuth } from '../middleware/auth.js';
import { HttpError, parse } from '../middleware/errors.js';
import { CATEGORIES, EMOTIONS, MARKETS } from '../services/catalog.js';
import { getPublicSettings } from '../services/settings.js';

/** Public data the app and website need before (or without) signing in. */
export const metaRouter = Router();

metaRouter.get('/meta', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ appName: config.appName, termsVersion: config.termsVersion, categories: CATEGORIES, markets: MARKETS, emotions: EMOTIONS });
});

/** Admin-managed settings + live announcements. Short cache so admin changes show up within a minute. */
metaRouter.get('/config', async (_req, res) => {
  const [settings, { rows: announcements }] = await Promise.all([
    getPublicSettings(),
    query(
      `SELECT id, title, body, level, cta_label AS "ctaLabel", cta_url AS "ctaUrl", starts_at AS "startsAt", ends_at AS "endsAt"
         FROM announcements
        WHERE active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
        ORDER BY created_at DESC LIMIT 5`,
    ),
  ]);
  res.set('Cache-Control', 'public, max-age=30');
  res.json({ appName: config.appName, termsVersion: config.termsVersion, settings, announcements, serverTime: new Date().toISOString() });
});

metaRouter.get('/templates', async (_req, res) => {
  const { rows } = await query(
    `SELECT slug, category, type, name, subtitle, icon, color, config FROM templates WHERE active ORDER BY sort_order, name`,
  );
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ templates: rows });
});

/* -------------------------------- Feedback -------------------------------- */

const feedbackLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Thanks! You’ve sent a lot of feedback — please try again later.' } }),
});

const feedbackSchema = z.object({
  kind: z.enum(['bug', 'idea', 'question', 'other']).default('other'),
  message: z.string().trim().min(5, 'Tell us a little more (at least 5 characters)').max(4000),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')).optional(),
  appVersion: z.string().max(20).optional(),
  platform: z.string().max(20).optional(),
});

metaRouter.post('/feedback', optionalAuth, feedbackLimit, async (req, res) => {
  const body = parse(feedbackSchema, req.body);
  const email = req.user?.email ?? body.email;
  if (!email) throw new HttpError(400, 'Add your email so we can reply', 'VALIDATION');
  await query(
    `INSERT INTO feedback (user_id, email, kind, message, app_version, platform) VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user?.id ?? null, email, body.kind, body.message, body.appVersion ?? null, body.platform ?? null],
  );
  res.status(201).json({ ok: true, message: 'Thanks — we read every message.' });
});
