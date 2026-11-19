/**
 * The Express app: security middleware, then every route group.
 *
 * Every request flows like this:
 *   helmet / cors / json body  →  auth check (if the route needs it)  →  route handler  →  JSON reply
 *   Any error thrown in a handler ends up in errorHandler (middleware/errors.js), which replies
 *   { error: { code, message } } with the right status code.
 *
 * Route map (each file lists its own endpoints at the top):
 *   /health                 is the server and database up?
 *   /api/...                public: app config, templates, feedback            → routes/meta.js
 *   /api/auth/...           sign up, sign in, email codes, passwords, profile   → routes/auth.js
 *   /api/dashboard/...      Today screen, XP, forest and games                   → routes/dashboard.js
 *   /api/trackers/...       trackers, check-ins, stats                           → routes/trackers.js
 *   /api/trackers/:id/trades|status                                              → routes/trackerTrades.js
 *   /api/trackers/:id/expenses                                                   → routes/trackerExpenses.js
 *   /api/trades/:id         edit / delete one trade                              → routes/entries.js
 *   /api/expenses/:id       edit / delete one expense                            → routes/entries.js
 *   /api/admin/...          admin panel (users, roles, audit)                    → routes/admin.js
 *                           admin panel (settings, content, analytics, system)   → routes/adminContent.js
 *                           admin panel (blocked IPs, locked accounts, log)      → routes/adminSecurity.js
 */
import cors from 'cors';
import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { blockDuringMaintenance } from './middleware/maintenance.js';
import { blockIps } from './services/security.js';
import { adminRouter } from './routes/admin.js';
import { adminContentRouter } from './routes/adminContent.js';
import { adminSecurityRouter } from './routes/adminSecurity.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { expensesRouter, tradesRouter } from './routes/entries.js';
import { metaRouter } from './routes/meta.js';
import { trackerExpensesRouter } from './routes/trackerExpenses.js';
import { trackersRouter } from './routes/trackers.js';
import { trackerTradesRouter } from './routes/trackerTrades.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render / a load balancer: trust its X-Forwarded-For (for rate limits)
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '200kb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev')); // request log (quiet in tests)

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  // Security for every API call: blocked IPs are refused, and no single IP may flood the API.
  // The ceiling is generous because many people can share one mobile-network IP.
  app.use('/api', blockIps);
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.apiRateLimit,
      keyGenerator: (req) => ipKeyGenerator(req.ip),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again in a minute.' } }),
    }),
  );

  // Public (some routes read the token if present)
  app.use('/api', metaRouter);
  app.use('/api/auth', authRouter);

  // Members only — and paused during maintenance mode (staff are let through)
  const member = [requireAuth, blockDuringMaintenance];
  app.use('/api/dashboard', ...member, dashboardRouter);
  app.use('/api/trackers', ...member, trackersRouter, trackerTradesRouter, trackerExpensesRouter);
  app.use('/api/trades', ...member, tradesRouter);
  app.use('/api/expenses', ...member, expensesRouter);

  // Staff only (each admin route also checks its own permission)
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter, adminContentRouter, adminSecurityRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
