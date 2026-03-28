import type { Request, Response, NextFunction } from 'express';
import redis, { isRedisConnected } from '../config/redis.ts';

interface MemEntry { count: number; resetAt: number; }
const memStore = new Map<string, MemEntry>();

function memIncr(key: string, windowMs: number): number {
  const now   = Date.now();
  const entry = memStore.get(key);

  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }

  entry.count += 1;
  return entry.count;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (now > entry.resetAt) memStore.delete(key);
  }
}, 5 * 60 * 1_000);

interface RateLimiterOptions {
  max?:       number;
  windowMs?:  number;
  keyPrefix?: string;
}

export function rateLimiter({
  max       = Number(process.env.RATE_LIMIT_MAX)       || 100,
  windowMs  = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  keyPrefix = 'rl',
}: RateLimiterOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${keyPrefix}:${req.ip}`;
    let current: number;

    if (isRedisConnected()) {
      current = await redis.incr(key);
      if (current === 1) await redis.pExpire(key, windowMs);
    } else {
      current = memIncr(key, windowMs);
    }

    res.set('X-RateLimit-Limit',     String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - current)));

    if (current > max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ success: false, error: 'Too many requests – slow down.' });
      return;
    }

    next();
  };
}
