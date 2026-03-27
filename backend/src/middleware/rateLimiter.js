import redis, { isRedisConnected } from '../config/redis.js';

// In-memory fallback store when Redis is unavailable
const memStore = new Map();

function memIncr(key, windowMs) {
  const now    = Date.now();
  const entry  = memStore.get(key);

  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }

  entry.count += 1;
  return entry.count;
}

// Purge expired in-memory keys every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (now > entry.resetAt) memStore.delete(key);
  }
}, 5 * 60 * 1_000);

/**
 * Fixed-window rate limiter.
 * Uses Redis when available, falls back to an in-process Map otherwise.
 */
export function rateLimiter({
  max       = Number(process.env.RATE_LIMIT_MAX)       || 100,
  windowMs  = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  keyPrefix = 'rl',
} = {}) {
  return async (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}`;
    let current;

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
      return res.status(429).json({ success: false, error: 'Too many requests – slow down.' });
    }

    next();
  };
}
