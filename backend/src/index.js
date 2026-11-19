import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { seed } from './db/seed.js';

async function main() {
  // Create / upgrade all tables, then seed defaults. Safe on every start and every deploy.
  await migrate();
  await seed();

  const server = createApp().listen(config.port, '0.0.0.0', () => {
    console.log(`${config.appName} API listening on :${config.port} (email: ${config.email.provider})`);
    if (config.email.problem) console.warn(`⚠️  EMAIL NOT WORKING: ${config.email.problem}`);
  });

  // Housekeeping: used/expired one-time codes are useless after a day
  const cleanup = () =>
    pool
      .query(`DELETE FROM email_codes WHERE expires_at < now() - interval '1 day'`)
      .catch((err) => console.error('cleanup failed:', err.message));
  void cleanup();
  const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
  cleanupTimer.unref();

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    clearInterval(cleanupTimer);
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
