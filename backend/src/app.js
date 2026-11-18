import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { expensesRouter, tradesRouter } from './routes/entries.js';
import { metaRouter } from './routes/meta.js';
import { trackersRouter } from './routes/trackers.js';
import { pool } from './db/pool.js';

const adminDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../admin/dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '200kb' }));
  app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.use('/api', metaRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', requireAuth, dashboardRouter);
  app.use('/api/trackers', requireAuth, trackersRouter);
  app.use('/api/trades', requireAuth, tradesRouter);
  app.use('/api/expenses', requireAuth, expensesRouter);
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter);

  // Serve the built admin panel (admin/dist) at /admin when present
  if (existsSync(adminDist)) {
    app.use('/admin', express.static(adminDist));
    app.get(/^\/admin(\/.*)?$/, (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
