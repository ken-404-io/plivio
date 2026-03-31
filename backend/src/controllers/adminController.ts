import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { NotFoundError, ValidationError } from '../utils/errors.ts';
import { sendWithdrawalStatusEmail } from '../services/email.ts';
import { createNotification } from '../utils/notify.ts';
import { listKycSubmissions, reviewKyc } from '../controllers/kycController.ts';

interface AdNetworkInput {
  name: string;
  weight: number;
  embed_code: string;
}

export async function getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [users, tasks, withdrawals, earnings] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE is_banned = FALSE'),
      pool.query('SELECT COUNT(*) FROM tasks WHERE is_active = TRUE'),
      pool.query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE status = 'pending'`),
      pool.query(`SELECT COALESCE(SUM(reward_earned), 0) AS total FROM task_completions WHERE status = 'approved'`),
    ]);

    type Row = Record<string, string>;
    res.json({
      success: true,
      stats: {
        total_users:              Number((users.rows[0] as Row).count),
        active_tasks:             Number((tasks.rows[0] as Row).count),
        pending_withdrawals:      Number((withdrawals.rows[0] as Row).count),
        pending_withdrawal_total: Number((withdrawals.rows[0] as Row).total),
        total_approved_earnings:  Number((earnings.rows[0] as Row).total),
      },
    });
  } catch (err) { next(err); }
}

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search as string}%` : null;

    const { rows } = await pool.query(
      `SELECT id, username, email, plan, balance, is_verified, is_banned, is_admin, created_at
       FROM users
       WHERE ($1::text IS NULL OR username ILIKE $1 OR email ILIKE $1)
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [search, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users WHERE ($1::text IS NULL OR username ILIKE $1 OR email ILIKE $1)`,
      [search]
    );

    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number((countResult.rows[0] as { count: string }).count) },
    });
  } catch (err) { next(err); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id }                  = req.params;
    const { is_banned, is_verified } = req.body as Record<string, string | undefined>;

    const setClauses: string[] = [];
    const values: unknown[]    = [];

    if (is_banned   !== undefined) { values.push(is_banned);   setClauses.push(`is_banned = $${values.length}`); }
    if (is_verified !== undefined) { values.push(is_verified); setClauses.push(`is_verified = $${values.length}`); }

    if (setClauses.length === 0) throw new ValidationError('No valid fields to update');

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING id, username, email, is_banned, is_verified`,
      values
    );

    if (rows.length === 0) throw new NotFoundError('User not found');
    res.json({ success: true, user: rows[0] });
  } catch (err) { next(err); }
}

export async function listAllTasks(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json({ success: true, tasks: rows });
  } catch (err) { next(err); }
}

export async function createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, type, reward_amount, min_plan = 'free' } = req.body as Record<string, string>;
    const { rows } = await pool.query(
      `INSERT INTO tasks (title, type, reward_amount, min_plan) VALUES ($1, $2, $3, $4) RETURNING *`,
      [title, type, reward_amount, min_plan]
    );
    res.status(201).json({ success: true, task: rows[0] });
  } catch (err) { next(err); }
}

export async function updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { title, reward_amount, is_active, min_plan } = req.body as Record<string, unknown>;

    const setClauses: string[] = [];
    const values: unknown[]    = [];

    if (title         !== undefined) { values.push(title);         setClauses.push(`title = $${values.length}`); }
    if (reward_amount !== undefined) { values.push(reward_amount); setClauses.push(`reward_amount = $${values.length}`); }
    if (is_active     !== undefined) { values.push(is_active);     setClauses.push(`is_active = $${values.length}`); }
    if (min_plan      !== undefined) { values.push(min_plan);      setClauses.push(`min_plan = $${values.length}`); }

    if (setClauses.length === 0) throw new ValidationError('No valid fields to update');

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (rows.length === 0) throw new NotFoundError('Task not found');
    res.json({ success: true, task: rows[0] });
  } catch (err) { next(err); }
}

export async function deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('UPDATE tasks SET is_active = FALSE WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) throw new NotFoundError('Task not found');
    res.json({ success: true, message: 'Task deactivated' });
  } catch (err) { next(err); }
}

export async function listPendingWithdrawals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = (req.query.status as string) || 'pending';
    const { rows } = await pool.query(
      `SELECT w.id, w.amount, w.method, w.status, w.requested_at, w.processed_at,
              u.username, u.email
       FROM withdrawals w JOIN users u ON u.id = w.user_id
       WHERE w.status = $1 ORDER BY w.requested_at ASC`,
      [status]
    );
    res.json({ success: true, withdrawals: rows });
  } catch (err) { next(err); }
}

export async function processWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const { id }     = req.params;
    const { action } = req.body as { action: 'approve' | 'reject' };

    if (!['approve', 'reject'].includes(action)) throw new ValidationError('action must be approve or reject');

    await client.query('BEGIN');

    const { rows: wRows } = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id]);
    if (wRows.length === 0) throw new NotFoundError('Withdrawal not found');

    const withdrawal = wRows[0] as Record<string, unknown>;
    if (withdrawal.status !== 'pending') throw new ValidationError('Withdrawal is not in pending state');

    const newStatus = action === 'approve' ? 'paid' : 'rejected';
    await client.query(`UPDATE withdrawals SET status = $1, processed_at = NOW() WHERE id = $2`, [newStatus, id]);

    if (action === 'reject') {
      await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [withdrawal.amount, withdrawal.user_id]);
    }

    // Fetch user email for notification (before commit so we have all data)
    const { rows: userRows } = await client.query(
      'SELECT email, username FROM users WHERE id = $1',
      [withdrawal.user_id],
    );

    await client.query('COMMIT');

    // Send email + in-app notification (outside transaction — non-fatal)
    if (userRows.length > 0) {
      const u = userRows[0] as { email: string; username: string };
      void sendWithdrawalStatusEmail(u.email, u.username, Number(withdrawal.amount), newStatus as 'paid' | 'rejected');

      const isPaid = newStatus === 'paid';
      void createNotification(
        withdrawal.user_id as string,
        isPaid ? 'withdrawal_paid' : 'withdrawal_rejected',
        isPaid ? 'Withdrawal Approved' : 'Withdrawal Rejected',
        isPaid
          ? `Your withdrawal of ₱${Number(withdrawal.amount).toFixed(2)} has been approved and is on its way.`
          : `Your withdrawal of ₱${Number(withdrawal.amount).toFixed(2)} was rejected. Your balance has been refunded.`,
        '/withdraw',
      );
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── Update ad networks for a video/ad task ───────────────────────────────

export async function updateAdNetworks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id }      = req.params;
    const { networks } = req.body as { networks: AdNetworkInput[] };

    if (!Array.isArray(networks)) throw new ValidationError('networks must be an array');

    for (const n of networks) {
      if (!n.name?.trim())       throw new ValidationError('Each network must have a name');
      if (typeof n.weight !== 'number' || n.weight < 1 || n.weight > 100) {
        throw new ValidationError(`Network "${n.name}" weight must be 1–100`);
      }
      if (!n.embed_code?.trim()) throw new ValidationError(`Network "${n.name}" must have embed_code`);
    }

    const result = await pool.query(
      `UPDATE tasks
       SET verification_config = verification_config || jsonb_build_object('networks', $1::jsonb)
       WHERE id = $2 AND type IN ('video', 'ad_click')
       RETURNING id, title, verification_config`,
      [JSON.stringify(networks), id]
    );

    if (result.rowCount === 0) throw new NotFoundError('Task not found or not a video/ad task');

    res.json({ success: true, task: result.rows[0] });
  } catch (err) { next(err); }
}
