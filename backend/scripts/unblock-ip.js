// Emergency: remove an IP block from the server command line (e.g. if an admin got auto-blocked).
//
//   npm run unblock-ip -- 203.0.113.7        remove blocks for this exact IP / range
//   npm run unblock-ip -- --all              remove every IP block
//
// The API picks up the change within 30 seconds.
import { pool } from '../src/db/pool.js';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run unblock-ip -- <ip or range>   (or --all)');
  process.exit(1);
}

try {
  const { rowCount } =
    arg === '--all' ? await pool.query('DELETE FROM blocked_ips') : await pool.query('DELETE FROM blocked_ips WHERE target = $1', [arg.trim()]);
  console.log(rowCount ? `✓ Removed ${rowCount} block${rowCount === 1 ? '' : 's'}. Takes effect within 30 seconds.` : 'Nothing to remove — that IP is not blocked.');
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
