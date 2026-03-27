import { createClient } from 'redis';
import { logger } from '../utils/logger.js';

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries >= 3) return false; // stop retrying after 3 attempts
      return Math.min(retries * 200, 1_000);
    },
  },
});

client.on('error', () => {}); // suppress noisy disconnect logs; handled in connectRedis

let connected = false;

/** Attempts to connect to Redis. Non-fatal — app runs with in-memory fallback if unavailable. */
export async function connectRedis() {
  if (!process.env.REDIS_URL && process.env.NODE_ENV !== 'production') {
    logger.warn({}, 'REDIS_URL not set – using in-memory rate-limit fallback');
    return;
  }
  try {
    await client.connect();
    connected = true;
    logger.info({}, 'Redis connected');
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis unavailable – using in-memory rate-limit fallback');
  }
}

export function isRedisConnected() {
  return connected;
}

export default client;
