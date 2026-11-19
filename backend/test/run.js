/**
 * Test runner:  npm test
 *
 * Starts a throw-away in-memory Postgres (PGlite) and the real API on a free port,
 * creates the staff accounts the tests use, then runs every *.test.js file in this folder.
 * Nothing touches your real database, and no emails are sent (they are captured instead).
 */
import { readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { captured } from './helpers.js';

/** Ask the OS for a free TCP port. */
const freePort = () =>
  new Promise((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

// 1. Throw-away database
const db = new PGlite('memory://');
await db.waitReady;
const dbPort = await freePort();
const dbServer = new PGLiteSocketServer({ db, port: dbPort, host: '127.0.0.1' });
await dbServer.start();

// 2. Environment for the API (must be set before the app's config is loaded)
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${dbPort}/postgres`,
  DB_SSL: 'false',
  DB_POOL_MAX: '1', // PGlite serves one connection at a time
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  EMAIL_PROVIDER: 'console',
  MAIL_FROM: 'Anchor <no-reply@test.local>',
  API_RATE_LIMIT: '100000', // the whole suite runs from one IP
});

// Capture emails printed by the console email provider (the tests read codes from them)
const realLog = console.log;
console.log = (...args) => {
  const text = args.join(' ');
  if (text.includes('[email:console]')) captured.emails.push(text);
  else realLog(...args);
};

// 3. Database tables + the staff accounts the tests sign in with
const { migrate } = await import('../src/db/migrate.js');
const { seed, upsertStaff } = await import('../src/db/seed.js');
const { ROLES } = await import('../src/services/roles.js');
const { pool } = await import('../src/db/pool.js');
const quiet = () => {};
await migrate({ log: quiet });
await seed({ log: quiet });
await upsertStaff({ email: 'boss@test.local', password: 'superpass123', role: ROLES.SUPER_ADMIN, name: 'Boss' }, quiet);
await upsertStaff({ email: 'admin@test.local', password: 'adminpass123', role: ROLES.SUPER_ADMIN, name: 'Second boss' }, quiet);
await upsertStaff({ email: 'staff@test.local', password: 'adminpass123', role: ROLES.ADMIN, name: 'Staff' }, quiet);

// 4. The API
const { createApp } = await import('../src/app.js');
const server = await new Promise((resolve) => {
  const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
});
captured.base = `http://127.0.0.1:${server.address().port}/api`;

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await dbServer.stop();
  await db.close();
});

// 5. Every test file, in name order (admin last, because it changes app-wide settings)
const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.js')).sort();
for (const file of files) await import(`./${file}`);
