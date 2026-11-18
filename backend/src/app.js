import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { blockDuringMaintenance } from './middleware/maintenance.js';
import { adminRouter } from './routes/admin.js';
import { adminContentRouter } from './routes/adminContent.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { expensesRouter, tradesRouter } from './routes/entries.js';
import { metaRouter } from './routes/meta.js';
import { trackersRouter } from './routes/trackers.js';
import { pool } from './db/pool.js';

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
  // Member features (paused during maintenance mode; staff are let through)
  const member = [requireAuth, blockDuringMaintenance];
  app.use('/api/dashboard', ...member, dashboardRouter);
  app.use('/api/trackers', ...member, trackersRouter);
  app.use('/api/trades', ...member, tradesRouter);
  app.use('/api/expenses', ...member, expensesRouter);
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter, adminContentRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
