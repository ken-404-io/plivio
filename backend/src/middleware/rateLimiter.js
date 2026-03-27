import redis from '../config/redis.js';

/**
 * Fixed-window rate limiter backed by Redis.
 * Increments a counter keyed by IP; expires the key after windowMs.
 */
export function rateLimiter({
  max       = Number(process.env.RATE_LIMIT_MAX)        || 100,
  windowMs  = Number(process.env.RATE_LIMIT_WINDOW_MS)  || 60_000,
  keyPrefix = 'rl',
} = {}) {
  return async (req, res, next) => {
    const key     = `${keyPrefix}:${req.ip}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.pExpire(key, windowMs);
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
