import pg from 'pg';
import { logger } from '../utils/logger.ts';

const { Pool } = pg;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString:        process.env.DATABASE_URL,
      max:                     10,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis: 5_000,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      host:                    process.env.DB_HOST,
      port:                    Number(process.env.DB_PORT) || 5432,
      database:                process.env.DB_NAME,
      user:                    process.env.DB_USER,
      password:                process.env.DB_PASSWORD,
      max:                     20,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis: 2_000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    });

pool.on('error', (err: Error) => logger.error({ err: err.message }, 'Unexpected PostgreSQL pool error'));

export async function connectDB(): Promise<void> {
  const client = await pool.connect();
  client.release();
  logger.info({}, 'PostgreSQL connected');
}

export default pool;
