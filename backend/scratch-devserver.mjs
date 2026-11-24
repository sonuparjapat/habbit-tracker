// TEMPORARY (delete after debugging): in-memory backend on :4000 with an admin boss@test.local / superpass123
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const db = new PGlite('memory://');
await db.waitReady;
const dbServer = new PGLiteSocketServer({ db, port: 55432, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:55432/postgres',
  DB_SSL: 'false',
  DB_POOL_MAX: '1',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  EMAIL_PROVIDER: 'console',
  MAIL_FROM: 'Holdfast <no-reply@test.local>',
  API_RATE_LIMIT: '100000',
  CORS_ORIGINS: 'http://localhost:3123',
});
const { migrate } = await import('./src/db/migrate.js');
const { seed, upsertStaff } = await import('./src/db/seed.js');
const { ROLES } = await import('./src/services/roles.js');
await migrate({ log: () => {} });
await seed({ log: () => {} });
await upsertStaff({ email: 'boss@test.local', password: 'superpass123', role: ROLES.SUPER_ADMIN, name: 'Boss' }, () => {});
const { createApp } = await import('./src/app.js');
createApp().listen(4000, '127.0.0.1', () => console.log('dev api on :4000'));
