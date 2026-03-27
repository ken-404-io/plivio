import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// Prefer DATABASE_URL (Neon / hosted Postgres) over individual env vars
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max:                        10,   // Neon pooler works best with ≤10
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis:  5_000,
      ssl: { rejectUnauthorized: false }, // required for Neon TLS
    })
  : new Pool({
      host:     process.env.DB_HOST,
      port:     Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max:      20,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis:  2_000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    });

pool.on('error', (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'));

/** Verifies the pool can reach the database. Called once at startup. */
export async function connectDB() {
  const client = await pool.connect();
  client.release();
  logger.info({}, 'PostgreSQL connected');
}

export default pool;
