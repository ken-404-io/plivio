import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { NotFoundError, ValidationError } from '../utils/errors.ts';
import { sendWithdrawalStatusEmail } from '../services/email.ts';
import { createNotification } from '../utils/notify.ts';
import { sendPushToUser }    from '../controllers/pushController.ts';
import { listKycSubmissions, reviewKyc } from '../controllers/kycController.ts';

interface AdNetworkInput {
  name: string;
  weight: number;
  embed_code: string;
}

export async function getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [users, tasks, withdrawals, earnings, newUsersToday, tasksToday, pendingKyc, coins] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE is_banned = FALSE'),
      pool.query('SELECT COUNT(*) FROM tasks WHERE is_active = TRUE'),
      pool.query(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM withdrawals WHERE status = 'pending'`),
      pool.query(`SELECT COALESCE(SUM(reward_earned), 0) AS total FROM task_completions WHERE status = 'approved'`),
      pool.query(`SELECT COUNT(*) FROM users WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`),
      pool.query(`SELECT COUNT(*) FROM task_completions WHERE status = 'approved' AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`),
      pool.query(`SELECT COUNT(*) FROM kyc_submissions WHERE status = 'pending'`),
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM coin_transactions WHERE type = 'earn'`),
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
        new_users_today:          Number((newUsersToday.rows[0] as Row).count),
        completed_tasks_today:    Number((tasksToday.rows[0] as Row).count),
        pending_kyc:              Number((pendingKyc.rows[0] as Row).count),
        total_coins_distributed:  Number((coins.rows[0] as Row).total),
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

const VALID_PLANS = ['free', 'premium', 'elite'] as const;

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as Record<string, string>;
    const body   = req.body as Record<string, string | undefined>;

    const { is_banned, is_verified, plan, balance_adjustment } = body;

    const setClauses: string[] = [];
    const values: unknown[]    = [];

    if (is_banned   !== undefined) { values.push(is_banned);   setClauses.push(`is_banned = $${values.length}`); }
    if (is_verified !== undefined) { values.push(is_verified); setClauses.push(`is_verified = $${values.length}`); }

    if (plan !== undefined) {
      if (!VALID_PLANS.includes(plan as typeof VALID_PLANS[number])) {
        throw new ValidationError('Invalid plan value');
      }
      values.push(plan);
      setClauses.push(`plan = $${values.length}`);
    }

    // balance_adjustment: a signed delta (positive = credit, negative = debit, floor at 0)
    if (balance_adjustment !== undefined) {
      const delta = parseFloat(balance_adjustment);
      if (isNaN(delta) || Math.abs(delta) > 100_000) throw new ValidationError('Invalid balance adjustment');
      // Use GREATEST to prevent balance going negative
      values.push(delta);
      setClauses.push(`balance = GREATEST(0, balance + $${values.length})`);
    }

    if (setClauses.length === 0) throw new ValidationError('No valid fields to update');

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length}
       RETURNING id, username, email, plan, balance, is_banned, is_verified`,
      values,
    );

    if (rows.length === 0) throw new NotFoundError('User not found');
    res.json({ success: true, user: rows[0] });
  } catch (err) { next(err); }
}

// ─── Admin notification send / broadcast ─────────────────────────────────────

/** POST /admin/notify  — send a custom in-app notification to one user */
export async function notifyUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user_id, title, message, link } = req.body as Record<string, string>;
    if (!user_id || !title?.trim() || !message?.trim()) {
      throw new ValidationError('user_id, title and message are required');
    }
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (rows.length === 0) throw new NotFoundError('User not found');

    await createNotification(user_id, 'admin_message', title.trim(), message.trim(), link ?? undefined);
    res.json({ success: true });
  } catch (err) { next(err); }
}

/** POST /admin/notify-all  — broadcast a notification to every non-banned user */
export async function broadcastNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, message, link } = req.body as Record<string, string>;
    if (!title?.trim() || !message?.trim()) {
      throw new ValidationError('title and message are required');
    }

    const { rows } = await pool.query(
      `SELECT id FROM users WHERE is_banned = FALSE`,
    );

    // Insert all notifications in a single batch query for efficiency
    if (rows.length > 0) {
      const ids = (rows as { id: string }[]).map((r) => r.id);
      const placeholders = ids.map((_, i) =>
        `($${i * 5 + 1}, 'admin_message', $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
      ).join(', ');
      const values = ids.flatMap((id) => [id, title.trim(), message.trim(), link ?? null, false]);
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, link, is_read) VALUES ${placeholders}`,
        values,
      );
    }

    res.json({ success: true, sent_to: rows.length });
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
    const { id } = req.params as Record<string, string>;
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
    const { id } = req.params as Record<string, string>;
    const { rows } = await pool.query('UPDATE tasks SET is_active = FALSE WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) throw new NotFoundError('Task not found');
    res.json({ success: true, message: 'Task deactivated' });
  } catch (err) { next(err); }
}

export async function listPendingWithdrawals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const status = (req.query.status as string) || 'pending';
    const { rows } = await pool.query(
      `SELECT w.id, w.amount, w.fee_amount, w.net_amount, w.method, w.status,
              w.account_name, w.account_number,
              w.requested_at, w.processed_at, w.processed_by,
              u.username, u.email
       FROM withdrawals w JOIN users u ON u.id = w.user_id
       WHERE w.status = $1 ORDER BY w.requested_at ASC`,
      [status]
    );
    res.json({ success: true, withdrawals: rows });
  } catch (err) { next(err); }
}

// ─── Audit log helper ──────────────────────────────────────────────────────

async function logAudit(
  adminId: string, action: string, targetType: string, targetId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminId, action, targetType, targetId, details ? JSON.stringify(details) : null],
    );
  } catch {
    // Non-fatal — don't let audit failures break the main flow
  }
}

// ─── Process a single withdrawal (approve → processing → paid, or reject) ──

export async function processWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const adminId = req.user!.id;
    const { id }  = req.params as Record<string, string>;
    const { action, rejection_reason } = req.body as {
      action: 'approve' | 'reject' | 'mark_paid';
      rejection_reason?: string;
    };

    if (!['approve', 'reject', 'mark_paid'].includes(action)) {
      throw new ValidationError('action must be approve, reject, or mark_paid');
    }
    if (action === 'reject' && !rejection_reason?.trim()) {
      throw new ValidationError('rejection_reason is required when rejecting');
    }

    await client.query('BEGIN');

    const { rows: wRows } = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id]);
    if (wRows.length === 0) throw new NotFoundError('Withdrawal not found');

    const withdrawal = wRows[0] as Record<string, unknown>;

    // Determine valid state transitions
    let newStatus: string;
    if (action === 'approve') {
      if (withdrawal.status !== 'pending') throw new ValidationError('Only pending withdrawals can be approved');
      newStatus = 'processing';
    } else if (action === 'mark_paid') {
      if (withdrawal.status !== 'processing') throw new ValidationError('Only processing withdrawals can be marked as paid');
      newStatus = 'paid';
    } else {
      // reject
      if (withdrawal.status !== 'pending' && withdrawal.status !== 'processing') {
        throw new ValidationError('Only pending or processing withdrawals can be rejected');
      }
      newStatus = 'rejected';
    }

    await client.query(
      `UPDATE withdrawals SET status = $1, rejection_reason = $2, processed_at = NOW(), processed_by = $3 WHERE id = $4`,
      [newStatus, action === 'reject' ? (rejection_reason ?? null) : null, adminId, id],
    );

    if (action === 'reject') {
      await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [withdrawal.amount, withdrawal.user_id]);
    }

    const { rows: userRows } = await client.query(
      'SELECT email, username FROM users WHERE id = $1',
      [withdrawal.user_id],
    );

    await client.query('COMMIT');

    const netAmount = Number(withdrawal.net_amount ?? withdrawal.amount);

    // Audit log
    void logAudit(adminId, `withdrawal_${action}`, 'withdrawal', id, {
      amount: Number(withdrawal.amount),
      net_amount: netAmount,
      method: withdrawal.method,
      username: (userRows[0] as { username: string } | undefined)?.username,
    });

    // Notifications — only on terminal states (paid or rejected)
    if ((newStatus === 'paid' || newStatus === 'rejected') && userRows.length > 0) {
      const u = userRows[0] as { email: string; username: string };
      void sendWithdrawalStatusEmail(u.email, u.username, netAmount, newStatus as 'paid' | 'rejected');

      const isPaid  = newStatus === 'paid';
      const wdTitle = isPaid ? 'Withdrawal Approved' : 'Withdrawal Rejected';
      const wdBody  = isPaid
        ? `Your withdrawal of ₱${netAmount.toFixed(2)} has been approved and is being sent to your account.`
        : `Your withdrawal was rejected. ₱${Number(withdrawal.amount).toFixed(2)} has been refunded to your balance.`;

      void createNotification(
        withdrawal.user_id as string,
        isPaid ? 'withdrawal_paid' : 'withdrawal_rejected',
        wdTitle, wdBody, '/withdraw',
      );
      void sendPushToUser(withdrawal.user_id as string, wdTitle, wdBody, '/withdraw');
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── Batch process multiple withdrawals ─────────────────────────────────────

export async function batchProcessWithdrawals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user!.id;
    const { ids, action, rejection_reason } = req.body as {
      ids: string[];
      action: 'approve' | 'reject' | 'mark_paid';
      rejection_reason?: string;
    };

    if (!Array.isArray(ids) || ids.length === 0) throw new ValidationError('ids must be a non-empty array');
    if (ids.length > 50) throw new ValidationError('Maximum 50 withdrawals per batch');
    if (!['approve', 'reject', 'mark_paid'].includes(action)) {
      throw new ValidationError('action must be approve, reject, or mark_paid');
    }
    if (action === 'reject' && !rejection_reason?.trim()) {
      throw new ValidationError('rejection_reason is required when rejecting');
    }

    const results: { id: string; status: string; error?: string }[] = [];

    for (const id of ids) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: wRows } = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id]);
        if (wRows.length === 0) { results.push({ id, status: 'error', error: 'Not found' }); await client.query('ROLLBACK'); continue; }

        const w = wRows[0] as Record<string, unknown>;

        // Validate state transition
        let newStatus: string;
        if (action === 'approve' && w.status === 'pending') { newStatus = 'processing'; }
        else if (action === 'mark_paid' && w.status === 'processing') { newStatus = 'paid'; }
        else if (action === 'reject' && (w.status === 'pending' || w.status === 'processing')) { newStatus = 'rejected'; }
        else { results.push({ id, status: 'skipped', error: `Cannot ${action} a ${w.status as string} withdrawal` }); await client.query('ROLLBACK'); continue; }

        await client.query(
          `UPDATE withdrawals SET status = $1, rejection_reason = $2, processed_at = NOW(), processed_by = $3 WHERE id = $4`,
          [newStatus, action === 'reject' ? (rejection_reason ?? null) : null, adminId, id],
        );

        if (action === 'reject') {
          await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [w.amount, w.user_id]);
        }

        const { rows: userRows } = await client.query('SELECT email, username FROM users WHERE id = $1', [w.user_id]);
        await client.query('COMMIT');

        const netAmount = Number(w.net_amount ?? w.amount);
        void logAudit(adminId, `withdrawal_batch_${action}`, 'withdrawal', id, {
          amount: Number(w.amount), net_amount: netAmount, method: w.method,
          username: (userRows[0] as { username: string } | undefined)?.username,
        });

        // Notifications on terminal states
        if ((newStatus === 'paid' || newStatus === 'rejected') && userRows.length > 0) {
          const u = userRows[0] as { email: string; username: string };
          void sendWithdrawalStatusEmail(u.email, u.username, netAmount, newStatus as 'paid' | 'rejected');
          const isPaid = newStatus === 'paid';
          void createNotification(
            w.user_id as string,
            isPaid ? 'withdrawal_paid' : 'withdrawal_rejected',
            isPaid ? 'Withdrawal Approved' : 'Withdrawal Rejected',
            isPaid
              ? `Your withdrawal of ₱${netAmount.toFixed(2)} has been approved and is being sent to your account.`
              : `Your withdrawal was rejected. ₱${Number(w.amount).toFixed(2)} has been refunded to your balance.`,
            '/withdraw',
          );
          void sendPushToUser(
            w.user_id as string,
            isPaid ? 'Withdrawal Approved' : 'Withdrawal Rejected',
            isPaid
              ? `Your withdrawal of ₱${netAmount.toFixed(2)} has been approved.`
              : `Your withdrawal was rejected. Balance refunded.`,
            '/withdraw',
          );
        }

        results.push({ id, status: newStatus });
      } catch {
        await client.query('ROLLBACK');
        results.push({ id, status: 'error', error: 'Processing failed' });
      } finally {
        client.release();
      }
    }

    res.json({ success: true, results });
  } catch (err) { next(err); }
}

// ─── List audit log ─────────────────────────────────────────────────────────

export async function listAuditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const { rows } = await pool.query(
      `SELECT a.*, u.username AS admin_username
       FROM admin_audit_log a
       JOIN users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json({ success: true, log: rows });
  } catch (err) { next(err); }
}

// ─── Update ad networks for a video/ad task ───────────────────────────────

export async function updateAdNetworks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id }      = req.params as Record<string, string>;
    const { networks } = req.body as { networks: AdNetworkInput[] };

    if (!Array.isArray(networks)) throw new ValidationError('networks must be an array');

    for (const n of networks) {
      if (!n.name?.trim())       throw new ValidationError('Each network must have a name');
      if (typeof n.weight !== 'number' || n.weight < 1 || n.weight > 100) {
        throw new ValidationError(`Network "${n.name}" weight must be 1–100`);
      }
      const code = n.embed_code?.trim() ?? '';
      if (!code) throw new ValidationError(`Network "${n.name}" must have embed_code`);
      // Only allow a single <script> or <iframe> tag — blocks inline event handlers and javascript: URLs
      if (!/^(<script[\s\S]*?<\/script>|<iframe[\s\S]*?<\/iframe>)\s*$/i.test(code)) {
        throw new ValidationError(`Network "${n.name}" embed_code must be a <script> or <iframe> tag`);
      }
      if (/javascript\s*:/i.test(code) || /\bon\w+\s*=/i.test(code)) {
        throw new ValidationError(`Network "${n.name}" embed_code contains disallowed attributes`);
      }
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
