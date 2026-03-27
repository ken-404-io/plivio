import { createClient } from 'redis';
import { logger } from '../utils/logger.js';

const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2_000),
  },
});

client.on('error', (err) => logger.error({ err }, 'Redis client error'));

/** Establishes Redis connection. Called once at startup. */
export async function connectRedis() {
  await client.connect();
  logger.info({}, 'Redis connected');
}

export default client;
