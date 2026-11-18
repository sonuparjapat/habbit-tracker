import pg from 'pg';
import { config } from '../config.js';

// DATE -> keep as 'YYYY-MM-DD' string (no timezone shifting)
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC -> number
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// INT8 (count(*)) -> number
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
  max: config.dbPoolMax,
});

pool.on('error', (err) => console.error('Postgres pool error', err));

export function query(text, params) {
  return pool.query(text, params);
}

/** Run fn(client) inside a transaction. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
