import pool from '../config/db.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../utils/errors.js';

const MIN_WITHDRAWAL = 50;   // PHP 50 minimum
const MAX_WITHDRAWAL = 5000; // PHP 5,000 maximum per request

// ─── Request withdrawal ────────────────────────────────────────────────────

export async function requestWithdrawal(req, res, next) {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const amount = Number(req.body.amount);
    const method = req.body.method; // 'gcash' | 'paypal'

    if (amount < MIN_WITHDRAWAL) {
      throw new ValidationError(`Minimum withdrawal is PHP ${MIN_WITHDRAWAL}`);
    }
    if (amount > MAX_WITHDRAWAL) {
      throw new ValidationError(`Maximum withdrawal per request is PHP ${MAX_WITHDRAWAL}`);
    }

    await client.query('BEGIN');

    // Lock user row and verify sufficient balance
    const userResult = await client.query(
      'SELECT balance, is_banned FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (userResult.rowCount === 0) throw new NotFoundError('User not found');

    const user = userResult.rows[0];
    if (user.is_banned) throw new ForbiddenError('Account suspended');
    if (Number(user.balance) < amount) {
      throw new ValidationError(
        `Insufficient balance. Available: PHP ${user.balance}`
      );
    }

    // Deduct balance and create withdrawal record atomically
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [amount, userId]
    );

    const { rows } = await client.query(
      `INSERT INTO withdrawals (user_id, amount, method)
       VALUES ($1, $2, $3)
       RETURNING id, amount, method, status, requested_at`,
      [userId, amount, method]
    );

    await client.query('COMMIT');

    res.status(201).json({ success: true, withdrawal: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── List user withdrawals ─────────────────────────────────────────────────

export async function listWithdrawals(req, res, next) {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `SELECT id, amount, method, status, requested_at, processed_at
       FROM withdrawals
       WHERE user_id = $1
       ORDER BY requested_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM withdrawals WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      data: rows,
      meta: {
        page,
        limit,
        total: Number(countResult.rows[0].count),
      },
    });
  } catch (err) {
    next(err);
  }
}
