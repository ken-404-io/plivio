import bcrypt from 'bcrypt';
import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { AuthenticationError, NotFoundError, ValidationError } from '../utils/errors.ts';

const BCRYPT_ROUNDS = 12;

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, plan, balance, referral_code,
              is_verified, is_admin, created_at,
              (totp_secret IS NOT NULL) AS has_2fa,
              (SELECT plan FROM subscriptions
               WHERE user_id = users.id AND is_active = TRUE AND expires_at > NOW()
               LIMIT 1) AS active_sub_plan,
              (SELECT expires_at FROM subscriptions
               WHERE user_id = users.id AND is_active = TRUE AND expires_at > NOW()
               LIMIT 1) AS sub_expires_at
       FROM users WHERE id = $1`,
      [req.user!.id]
    );

    if (rows.length === 0) throw new NotFoundError('User not found');
    res.json({ success: true, user: rows[0] });
  } catch (err) { next(err); }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { current_password, new_password } = req.body as Record<string, string>;

    if (!current_password || !new_password) {
      throw new ValidationError('Both current and new password are required');
    }
    if (new_password.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }
    if (new_password.length > 128) {
      throw new ValidationError('New password must not exceed 128 characters');
    }

    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user!.id]
    );
    if (rows.length === 0) throw new NotFoundError('User not found');

    const { password_hash } = rows[0] as { password_hash: string };
    const matches = await bcrypt.compare(current_password, password_hash);
    if (!matches) throw new AuthenticationError('Current password is incorrect');

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user!.id]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) { next(err); }
}

export async function getEarnings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `SELECT tc.id, t.title, t.type, tc.reward_earned, tc.status, tc.completed_at
       FROM task_completions tc
       JOIN tasks t ON t.id = tc.task_id
       WHERE tc.user_id = $1
       ORDER BY tc.completed_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user!.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM task_completions WHERE user_id = $1',
      [req.user!.id]
    );

    res.json({
      success: true,
      data:    rows,
      meta: { page, limit, total: Number((countResult.rows[0] as { count: string }).count) },
    });
  } catch (err) { next(err); }
}

export async function getReferrals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT u.username, u.plan, u.created_at
       FROM users u WHERE u.referred_by = $1 ORDER BY u.created_at DESC`,
      [req.user!.id]
    );
    res.json({ success: true, referrals: rows });
  } catch (err) { next(err); }
}
