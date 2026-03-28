import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ValidationError } from '../utils/errors.ts';

interface PlanInfo {
  name:        string;
  price_php:   number;
  daily_limit: number | null;
  features:    string[];
}

export const PLANS: Record<string, PlanInfo> = {
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
    daily_limit: null,
    features:    ['All tasks', 'Unlimited daily earnings', 'Exclusive tasks', 'No ads', 'Early access', 'VIP support'],
  },
};

export async function getPlans(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, plans: PLANS });
}

export async function getCurrentSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, plan, starts_at, expires_at, is_active
       FROM subscriptions
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [req.user!.id]
    );
    res.json({ success: true, subscription: rows[0] ?? null });
  } catch (err) { next(err); }
}

export async function subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const { plan, duration_days = 30 } = req.body as { plan: string; duration_days?: number };
    const userId = req.user!.id;

    if (!PLANS[plan] || plan === 'free') throw new ValidationError('Invalid plan selected');
    if (Number(duration_days) < 1 || Number(duration_days) > 365) throw new ValidationError('Duration must be between 1 and 365 days');

    await client.query('BEGIN');
    await client.query('UPDATE subscriptions SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE', [userId]);

    const { rows } = await client.query(
      `INSERT INTO subscriptions (user_id, plan, starts_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + ($3 || ' days')::INTERVAL)
       RETURNING id, plan, starts_at, expires_at`,
      [userId, plan, duration_days]
    );

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
