// Usage: npm run create-admin -- you@example.com "a-strong-password"
// Creates the admin, or promotes an existing user to admin.
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
import { ensureAdmin } from '../src/db/seed.js';

const [email, password] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run create-admin -- <email> [password]');
  process.exit(1);
}

try {
  await migrate();
  await ensureAdmin(email.trim().toLowerCase(), password);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
