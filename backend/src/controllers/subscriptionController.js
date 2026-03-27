import pool from '../config/db.js';
import { ValidationError, ConflictError } from '../utils/errors.js';

// Plan catalogue – amounts in PHP
export const PLANS = {
  free: {
    name:        'Free',
    price_php:   0,
    daily_limit: 20,
    features:    ['Basic tasks', 'PHP 20 daily limit', 'GCash & PayPal withdrawals'],
  },
  premium: {
    name:        'Premium',
    price_php:   249,
    daily_limit: 100,
    features:    ['All tasks', 'PHP 100 daily limit', 'Exclusive tasks', 'No ads', 'Priority support'],
  },
  elite: {
    name:        'Elite',
    price_php:   499,
    daily_limit: null, // unlimited
    features:    ['All tasks', 'Unlimited daily earnings', 'Exclusive tasks', 'No ads', 'Early access', 'VIP support'],
  },
};

// ─── Get plan catalogue ────────────────────────────────────────────────────

export async function getPlans(_req, res) {
  res.json({ success: true, plans: PLANS });
}

// ─── Get current subscription ──────────────────────────────────────────────

export async function getCurrentSubscription(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, plan, starts_at, expires_at, is_active
       FROM subscriptions
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY expires_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    res.json({ success: true, subscription: rows[0] || null });
  } catch (err) {
    next(err);
  }
}

// ─── Subscribe ─────────────────────────────────────────────────────────────
// NOTE: In production this endpoint would be triggered by a payment webhook
//       (e.g. PayMongo/GCash). Here we manually activate for demo/admin use.

export async function subscribe(req, res, next) {
  const client = await pool.connect();
  try {
    const { plan, duration_days = 30 } = req.body;
    const userId = req.user.id;

    if (!PLANS[plan] || plan === 'free') {
      throw new ValidationError('Invalid plan selected');
    }
    if (duration_days < 1 || duration_days > 365) {
      throw new ValidationError('Duration must be between 1 and 365 days');
    }

    await client.query('BEGIN');

    // Deactivate any existing subscription
    await client.query(
      'UPDATE subscriptions SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );

    const { rows } = await client.query(
      `INSERT INTO subscriptions (user_id, plan, starts_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + ($3 || ' days')::INTERVAL)
       RETURNING id, plan, starts_at, expires_at`,
      [userId, plan, duration_days]
    );

    // Update user plan column for quick lookups
    await client.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);

    await client.query('COMMIT');

    res.status(201).json({ success: true, subscription: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
