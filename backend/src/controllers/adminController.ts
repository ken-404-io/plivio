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
    const planFilter = ['free', 'premium', 'elite'].includes(req.query.plan as string)
      ? (req.query.plan as string) : null;
    const statusFilter = ['active', 'banned'].includes(req.query.status as string)
      ? (req.query.status as string) : null;
    const deviceFilter = ['registered', 'unregistered'].includes(req.query.device as string)
      ? (req.query.device as string) : null;
    const dateFrom = req.query.date_from ? (req.query.date_from as string) : null;
    const dateTo   = req.query.date_to   ? (req.query.date_to as string)   : null;

    const { rows } = await pool.query(
      `SELECT id, username, email, plan, balance, is_verified, is_banned, is_admin,
              device_fingerprint, created_at
       FROM users
       WHERE ($1::text IS NULL OR username ILIKE $1 OR email ILIKE $1)
         AND ($3::plan_type IS NULL OR plan = $3::plan_type)
         AND ($5::text IS NULL OR ($5 = 'banned' AND is_banned = TRUE) OR ($5 = 'active' AND is_banned = FALSE))
         AND ($6::text IS NULL OR ($6 = 'registered' AND device_fingerprint IS NOT NULL) OR ($6 = 'unregistered' AND device_fingerprint IS NULL))
         AND ($7::timestamptz IS NULL OR created_at >= $7::timestamptz)
         AND ($8::timestamptz IS NULL OR created_at <= ($8::timestamptz + INTERVAL '1 day'))
       ORDER BY created_at DESC LIMIT $2 OFFSET $4`,
      [search, limit, planFilter, offset, statusFilter, deviceFilter, dateFrom, dateTo]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users
       WHERE ($1::text IS NULL OR username ILIKE $1 OR email ILIKE $1)
         AND ($2::plan_type IS NULL OR plan = $2::plan_type)
         AND ($3::text IS NULL OR ($3 = 'banned' AND is_banned = TRUE) OR ($3 = 'active' AND is_banned = FALSE))
         AND ($4::text IS NULL OR ($4 = 'registered' AND device_fingerprint IS NOT NULL) OR ($4 = 'unregistered' AND device_fingerprint IS NULL))
         AND ($5::timestamptz IS NULL OR created_at >= $5::timestamptz)
         AND ($6::timestamptz IS NULL OR created_at <= ($6::timestamptz + INTERVAL '1 day'))`,
      [search, planFilter, statusFilter, deviceFilter, dateFrom, dateTo]
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
              w.requested_at, w.processed_at,
              u.username, u.email
       FROM withdrawals w JOIN users u ON u.id = w.user_id
       WHERE w.status = $1 ORDER BY w.requested_at ASC`,
      [status]
    );
    res.json({ success: true, withdrawals: rows });
  } catch (err) { next(err); }
}

/** GET /admin/withdrawals/history – full withdrawal history with filters */
export async function listWithdrawalHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const status   = ['pending', 'processing', 'paid', 'rejected', 'cancelled'].includes(req.query.status as string)
      ? (req.query.status as string) : null;
    const plan     = ['free', 'premium', 'elite'].includes(req.query.plan as string)
      ? (req.query.plan as string) : null;
    const search   = req.query.search ? `%${req.query.search as string}%` : null;
    const dateFrom = req.query.date_from ? (req.query.date_from as string) : null;
    const dateTo   = req.query.date_to   ? (req.query.date_to as string)   : null;
    const amountMin = req.query.amount_min ? Number(req.query.amount_min) : null;
    const amountMax = req.query.amount_max ? Number(req.query.amount_max) : null;

    const { rows } = await pool.query(
      `SELECT w.id, w.amount, w.fee_amount, w.net_amount, w.method, w.status::text,
              w.account_name, w.account_number, w.rejection_reason,
              w.requested_at, w.processed_at,
              u.username, u.email, u.plan::text AS user_plan
       FROM withdrawals w JOIN users u ON u.id = w.user_id
       WHERE ($1::text IS NULL OR w.status::text = $1)
         AND ($2::text IS NULL OR u.plan::text = $2)
         AND ($3::text IS NULL OR u.username ILIKE $3 OR u.email ILIKE $3)
         AND ($4::timestamptz IS NULL OR w.requested_at >= $4::timestamptz)
         AND ($5::timestamptz IS NULL OR w.requested_at <= ($5::timestamptz + INTERVAL '1 day'))
         AND ($8::numeric IS NULL OR w.amount >= $8)
         AND ($9::numeric IS NULL OR w.amount <= $9)
       ORDER BY w.requested_at DESC
       LIMIT $6 OFFSET $7`,
      [status, plan, search, dateFrom, dateTo, limit, offset, amountMin, amountMax],
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM withdrawals w JOIN users u ON u.id = w.user_id
       WHERE ($1::text IS NULL OR w.status::text = $1)
         AND ($2::text IS NULL OR u.plan::text = $2)
         AND ($3::text IS NULL OR u.username ILIKE $3 OR u.email ILIKE $3)
         AND ($4::timestamptz IS NULL OR w.requested_at >= $4::timestamptz)
         AND ($5::timestamptz IS NULL OR w.requested_at <= ($5::timestamptz + INTERVAL '1 day'))
         AND ($6::numeric IS NULL OR w.amount >= $6)
         AND ($7::numeric IS NULL OR w.amount <= $7)`,
      [status, plan, search, dateFrom, dateTo, amountMin, amountMax],
    );

    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number((countResult.rows[0] as { count: string }).count) },
    });
  } catch (err) { next(err); }
}

export async function processWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const { id }     = req.params as Record<string, string>;
    const { action, rejection_reason } = req.body as { action: 'approve' | 'reject'; rejection_reason?: string };

    if (!['approve', 'reject'].includes(action)) throw new ValidationError('action must be approve or reject');
    if (action === 'reject' && !rejection_reason?.trim()) {
      throw new ValidationError('rejection_reason is required when rejecting');
    }

    await client.query('BEGIN');

    const { rows: wRows } = await client.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [id]);
    if (wRows.length === 0) throw new NotFoundError('Withdrawal not found');

    const withdrawal = wRows[0] as Record<string, unknown>;
    if (withdrawal.status !== 'pending') throw new ValidationError('Withdrawal is not in pending state');

    const newStatus = action === 'approve' ? 'paid' : 'rejected';
    await client.query(
      `UPDATE withdrawals SET status = $1, rejection_reason = $2, processed_at = NOW() WHERE id = $3`,
      [newStatus, action === 'reject' ? (rejection_reason ?? null) : null, id],
    );

    if (action === 'reject') {
      // Refund the full requested amount (fee waived on rejection)
      await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [withdrawal.amount, withdrawal.user_id]);
    }

    // Fetch user email for notification (before commit so we have all data)
    const { rows: userRows } = await client.query(
      'SELECT email, username FROM users WHERE id = $1',
      [withdrawal.user_id],
    );

    await client.query('COMMIT');

    const netAmount = Number(withdrawal.net_amount ?? withdrawal.amount);

    // Send email + in-app notification (outside transaction — non-fatal)
    if (userRows.length > 0) {
      const u = userRows[0] as { email: string; username: string };
      void sendWithdrawalStatusEmail(
        u.email,
        u.username,
        netAmount,
        newStatus as 'paid' | 'rejected',
        action === 'reject' ? (rejection_reason ?? undefined) : undefined,
      );

      const isPaid  = newStatus === 'paid';
      const wdTitle = isPaid ? 'Withdrawal Approved' : 'Withdrawal Rejected';
      const wdBody  = isPaid
        ? `Your withdrawal of ₱${netAmount.toFixed(2)} has been approved and is being sent to your account.`
        : `Your withdrawal was rejected. ₱${Number(withdrawal.amount).toFixed(2)} has been refunded to your balance.${rejection_reason?.trim() ? ` Reason: ${rejection_reason.trim()}` : ''}`;

      void createNotification(
        withdrawal.user_id as string,
        isPaid ? 'withdrawal_paid' : 'withdrawal_rejected',
        wdTitle,
        wdBody,
        '/withdraw',
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

// ─── GET /admin/users/:id/details ────────────────────────────────────────────

export async function getUserDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as Record<string, string>;

    const [subResult, invitesResult, withdrawalsResult, deviceResult] = await Promise.all([
      // Current active subscription (if any)
      pool.query(
        `SELECT plan, starts_at, expires_at, is_active
         FROM subscriptions
         WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
         ORDER BY expires_at DESC LIMIT 1`,
        [id],
      ),
      // Users invited by this user (verified only)
      pool.query(
        `SELECT u.username, u.email, u.plan, u.created_at
         FROM users u
         WHERE u.referred_by = $1 AND u.is_email_verified = TRUE
         ORDER BY u.created_at DESC`,
        [id],
      ),
      // Withdrawal history (most recent 50)
      pool.query(
        `SELECT id, amount, fee_amount, net_amount, method, status,
                account_name, account_number, rejection_reason,
                requested_at, processed_at
         FROM withdrawals
         WHERE user_id = $1
         ORDER BY requested_at DESC
         LIMIT 50`,
        [id],
      ),
      // Device info — use a safe query that won't fail if new columns don't exist yet
      pool.query(
        `SELECT device_fingerprint FROM users WHERE id = $1`,
        [id],
      ).then(async (baseResult) => {
        const row = baseResult.rows[0] as { device_fingerprint: string | null } | undefined;
        if (!row?.device_fingerprint) return { rows: [{ device_fingerprint: null, device_name: null, device_registered_at: null }] };
        // Try to fetch new columns; fall back gracefully if migration hasn't run
        try {
          return await pool.query(
            `SELECT device_fingerprint, device_name, device_registered_at FROM users WHERE id = $1`,
            [id],
          );
        } catch {
          return baseResult;
        }
      }),
    ]);

    const deviceRow = deviceResult.rows[0] as { device_fingerprint: string | null; device_name?: string | null; device_registered_at?: string | null } | undefined;

    res.json({
      success:      true,
      subscription: subResult.rows[0] ?? null,
      invites:      invitesResult.rows,
      withdrawals:  withdrawalsResult.rows,
      device:       deviceRow?.device_fingerprint ? {
        fingerprint:    deviceRow.device_fingerprint,
        device_name:    deviceRow.device_name ?? null,
        registered_at:  deviceRow.device_registered_at ?? null,
      } : null,
    });
  } catch (err) { next(err); }
}

/** PUT /admin/users/:id/reset-device – admin resets user's bound device */
export async function resetUserDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params as Record<string, string>;

    // Try resetting all device columns; fall back to just fingerprint if new columns don't exist
    try {
      await pool.query(
        `UPDATE users SET device_fingerprint = NULL, device_name = NULL, device_registered_at = NULL WHERE id = $1`,
        [id],
      );
    } catch {
      await pool.query(
        `UPDATE users SET device_fingerprint = NULL WHERE id = $1`,
        [id],
      );
    }

    res.json({ success: true, message: 'Device unlinked. User can now log in from any device.' });
  } catch (err) { next(err); }
}

// ─── GET /admin/referrals — list all referrals across users ─────────────────

export async function listReferrals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const search   = req.query.search ? `%${req.query.search as string}%` : null;
    const dateFrom = req.query.date_from ? (req.query.date_from as string) : null;
    const dateTo   = req.query.date_to   ? (req.query.date_to as string)   : null;

    const { rows } = await pool.query(
      `SELECT
         referrer.id AS referrer_id, referrer.username AS referrer_username,
         referrer.referral_batches_credited,
         invited.username AS invited_username, invited.email AS invited_email,
         invited.plan::text AS invited_plan, invited.is_email_verified,
         invited.created_at AS invited_at
       FROM users invited
       JOIN users referrer ON referrer.id = invited.referred_by
       WHERE invited.is_email_verified = TRUE
         AND ($1::text IS NULL OR referrer.username ILIKE $1 OR invited.username ILIKE $1)
         AND ($2::timestamptz IS NULL OR invited.created_at >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR invited.created_at <= ($3::timestamptz + INTERVAL '1 day'))
       ORDER BY invited.created_at DESC
       LIMIT $4 OFFSET $5`,
      [search, dateFrom, dateTo, limit, offset],
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users invited
       JOIN users referrer ON referrer.id = invited.referred_by
       WHERE invited.is_email_verified = TRUE
         AND ($1::text IS NULL OR referrer.username ILIKE $1 OR invited.username ILIKE $1)
         AND ($2::timestamptz IS NULL OR invited.created_at >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR invited.created_at <= ($3::timestamptz + INTERVAL '1 day'))`,
      [search, dateFrom, dateTo],
    );

    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number((countResult.rows[0] as { count: string }).count) },
    });
  } catch (err) { next(err); }
}

// ─── GET /admin/notifications — notification logs ───────────────────────────

export async function listNotificationLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const search   = req.query.search ? `%${req.query.search as string}%` : null;
    const dateFrom = req.query.date_from ? (req.query.date_from as string) : null;
    const dateTo   = req.query.date_to   ? (req.query.date_to as string)   : null;
    const readFilter = ['read', 'unread'].includes(req.query.status as string)
      ? (req.query.status as string) : null;

    const { rows } = await pool.query(
      `SELECT n.id, n.type, n.title, n.message, n.link, n.is_read, n.created_at,
              u.username, u.email
       FROM notifications n
       JOIN users u ON u.id = n.user_id
       WHERE ($1::text IS NULL OR u.username ILIKE $1 OR n.title ILIKE $1)
         AND ($2::timestamptz IS NULL OR n.created_at >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR n.created_at <= ($3::timestamptz + INTERVAL '1 day'))
         AND ($4::text IS NULL OR ($4 = 'read' AND n.is_read = TRUE) OR ($4 = 'unread' AND n.is_read = FALSE))
       ORDER BY n.created_at DESC
       LIMIT $5 OFFSET $6`,
      [search, dateFrom, dateTo, readFilter, limit, offset],
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM notifications n
       JOIN users u ON u.id = n.user_id
       WHERE ($1::text IS NULL OR u.username ILIKE $1 OR n.title ILIKE $1)
         AND ($2::timestamptz IS NULL OR n.created_at >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR n.created_at <= ($3::timestamptz + INTERVAL '1 day'))
         AND ($4::text IS NULL OR ($4 = 'read' AND n.is_read = TRUE) OR ($4 = 'unread' AND n.is_read = FALSE))`,
      [search, dateFrom, dateTo, readFilter],
    );

    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number((countResult.rows[0] as { count: string }).count) },
    });
  } catch (err) { next(err); }
}

// ─── GET /admin/export/:section — CSV export ────────────────────────────────

export async function exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { section } = req.params as Record<string, string>;
    let rows: Record<string, unknown>[] = [];
    let filename = 'export.csv';

    if (section === 'users') {
      const result = await pool.query(
        `SELECT username, email, plan::text, balance, is_banned, is_verified, device_fingerprint, created_at
         FROM users ORDER BY created_at DESC`,
      );
      rows = result.rows as Record<string, unknown>[];
      filename = 'users.csv';
    } else if (section === 'withdrawals') {
      const result = await pool.query(
        `SELECT w.id, u.username, u.email, u.plan::text AS user_plan, w.amount, w.fee_amount, w.net_amount,
                w.method, w.status::text, w.account_name, w.account_number, w.rejection_reason,
                w.requested_at, w.processed_at
         FROM withdrawals w JOIN users u ON u.id = w.user_id
         ORDER BY w.requested_at DESC`,
      );
      rows = result.rows as Record<string, unknown>[];
      filename = 'withdrawals.csv';
    } else if (section === 'referrals') {
      const result = await pool.query(
        `SELECT referrer.username AS referrer, invited.username AS invited_user,
                invited.email AS invited_email, invited.plan::text AS plan, invited.created_at
         FROM users invited
         JOIN users referrer ON referrer.id = invited.referred_by
         WHERE invited.is_email_verified = TRUE
         ORDER BY invited.created_at DESC`,
      );
      rows = result.rows as Record<string, unknown>[];
      filename = 'referrals.csv';
    } else if (section === 'notifications') {
      const result = await pool.query(
        `SELECT u.username, n.type, n.title, n.message, n.is_read, n.created_at
         FROM notifications n JOIN users u ON u.id = n.user_id
         ORDER BY n.created_at DESC LIMIT 5000`,
      );
      rows = result.rows as Record<string, unknown>[];
      filename = 'notifications.csv';
    } else {
      throw new ValidationError('Invalid section. Valid: users, withdrawals, referrals, notifications');
    }

    if (rows.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('No data');
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvLines.join('\n'));
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
