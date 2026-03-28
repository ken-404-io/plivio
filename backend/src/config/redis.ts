import { createClient } from 'redis';
import { logger } from '../utils/logger.ts';

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries >= 3) return false;
      return Math.min(retries * 200, 1_000);
    },
  },
});

client.on('error', () => {});

let connected = false;

export async function connectRedis(): Promise<void> {
  if (!process.env.REDIS_URL && process.env.NODE_ENV !== 'production') {
    logger.warn({}, 'REDIS_URL not set – using in-memory rate-limit fallback');
    return;
  }
  try {
    await client.connect();
    connected = true;
    logger.info({}, 'Redis connected');
  } catch (err: unknown) {
    logger.warn({ err: (err as Error).message }, 'Redis unavailable – using in-memory rate-limit fallback');
  }
}

export function isRedisConnected(): boolean {
  return connected;
}

export default client;
