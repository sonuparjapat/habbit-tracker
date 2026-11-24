import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { seed } from './db/seed.js';
import { runNudges } from './services/nudges.js';
import { cleanupOps, retryDueOps } from './services/sync.js';

async function main() {
  // Create / upgrade all tables, then seed defaults. Safe on every start and every deploy.
  await migrate();
  await seed();

  const server = createApp().listen(config.port, '0.0.0.0', () => {
    console.log(`${config.appName} API listening on :${config.port} (email: ${config.email.provider})`);
    if (config.email.problem) console.warn(`⚠️  EMAIL NOT WORKING: ${config.email.problem}`);
  });

  // Housekeeping: used/expired one-time codes are useless after a day; the security log is kept 90 days
  const cleanup = () =>
    Promise.all([
      pool.query(`DELETE FROM email_codes WHERE expires_at < now() - interval '1 day'`),
      pool.query(`DELETE FROM security_events WHERE created_at < now() - interval '90 days'`),
    ]).catch((err) => console.error('cleanup failed:', err.message));
  void cleanup();
  const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
  cleanupTimer.unref();

  // Evening check-in: every 5 minutes, nudge members who reached their check hour and missed a tracker
  const nudge = () => runNudges().catch((err) => console.error('evening check-in failed:', err.message));
  const nudgeTimer = setInterval(nudge, 5 * 60 * 1000);
  nudgeTimer.unref();

  // Offline sync: retry changes that failed for a temporary reason (every 2 minutes), tidy old ones daily
  const retrySync = () => retryDueOps().catch((err) => console.error('sync retry failed:', err.message));
  const syncTimer = setInterval(retrySync, 2 * 60 * 1000);
  syncTimer.unref();
  const tidyTimer = setInterval(() => cleanupOps().catch(() => {}), 24 * 60 * 60 * 1000);
  tidyTimer.unref();

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    clearInterval(cleanupTimer);
    clearInterval(nudgeTimer);
    clearInterval(syncTimer);
    clearInterval(tidyTimer);
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
