// Create or update a staff account. Run on the server (or anywhere with DATABASE_URL set).
//
//   npm run create-admin -- you@example.com "strong-password"           -> super admin (role 1)
//   npm run create-admin -- you@example.com "strong-password" --admin   -> admin (role 2)
//   npm run create-admin -- existing@user.com                           -> promote an existing user to super admin
//   npm run create-admin -- someone@x.com --user                        -> demote back to a normal user (role 3)
//
// Super admins can only be created here, never from the admin panel or API.
import { migrate } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';
import { upsertStaff } from '../src/db/seed.js';
import { ROLES } from '../src/services/roles.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [email, password] = args.filter((a) => !a.startsWith('--'));

if (!email || !email.includes('@')) {
  console.error('Usage: npm run create-admin -- <email> [password] [--admin | --user]');
  process.exit(1);
}

const role = flags.has('--user') ? ROLES.USER : flags.has('--admin') ? ROLES.ADMIN : ROLES.SUPER_ADMIN;

try {
  await migrate({ log: () => {} });
  await upsertStaff({ email: email.trim().toLowerCase(), password, role });
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
