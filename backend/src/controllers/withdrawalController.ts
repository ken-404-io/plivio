import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ValidationError, ForbiddenError, NotFoundError } from '../utils/errors.ts';

const FREE_PLAN_WITHDRAWAL_LIMIT = 1;
const FREE_PLAN_MAX_AMOUNT       = 100;
const FREE_PLAN_UPGRADE_CODE     = 'free_plan_limit_reached';
const COOLDOWN_CODE              = 'withdrawal_cooldown';
const COOLDOWN_HOURS             = 24;

const MIN_WITHDRAWAL  = 50;
const MAX_WITHDRAWAL  = 5000;
const FEE_RATE        = 0.05;   // 5% total (1% document + 4% handling)
const GCASH_PHONE_RE  = /^09\d{9}$/;
const PAYPAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Request withdrawal ────────────────────────────────────────────────────────

export async function requestWithdrawal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const body   = req.body as Record<string, unknown>;

    const amount         = Number(body.amount);
    const method         = String(body.method ?? '').toLowerCase();
    const accountName    = String(body.account_name   ?? '').trim();
    const accountNumber  = String(body.account_number ?? '').trim();

    // ── Amount validation ───────────────────────────────────────────────────
    if (amount < MIN_WITHDRAWAL) {
      throw new ValidationError(`Minimum withdrawal is ₱${MIN_WITHDRAWAL}`);
    }
    if (amount > MAX_WITHDRAWAL) {
      throw new ValidationError(`Maximum withdrawal per request is ₱${MAX_WITHDRAWAL}`);
    }

    // ── Method-specific account validation ──────────────────────────────────
    if (!['gcash', 'paypal'].includes(method)) {
      throw new ValidationError('method must be gcash or paypal');
    }
    if (!accountName || accountName.length < 2 || accountName.length > 100) {
      throw new ValidationError('account_name is required (2–100 characters)');
    }
    if (method === 'gcash' && !GCASH_PHONE_RE.test(accountNumber)) {
      throw new ValidationError('GCash number must be in format 09XXXXXXXXX (11 digits)');
    }
    if (method === 'paypal' && !PAYPAL_EMAIL_RE.test(accountNumber)) {
      throw new ValidationError('PayPal account must be a valid email address');
    }

    // ── Fee calculation ─────────────────────────────────────────────────────
    const feeAmount = Math.round(amount * FEE_RATE * 100) / 100;
    const netAmount = Math.round((amount - feeAmount) * 100) / 100;

    await client.query('BEGIN');

    // Lock the user row to prevent race conditions on balance
    const { rows: userRows, rowCount } = await client.query(
      'SELECT balance, is_banned, kyc_status, plan FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (!rowCount) throw new NotFoundError('User not found');

    const user = userRows[0] as { balance: string; is_banned: boolean; kyc_status: string; plan: string };

    if (user.is_banned) throw new ForbiddenError('Account suspended');
    if (user.kyc_status !== 'approved') {
      throw new ForbiddenError('Identity verification required before withdrawing');
    }
    if (Number(user.balance) < amount) {
      throw new ValidationError(`Insufficient balance. Available: ₱${Number(user.balance).toFixed(2)}`);
    }

    // Free plan: max ₱100 per withdrawal and limited to 1 total
    if (user.plan === 'free') {
      if (amount > FREE_PLAN_MAX_AMOUNT) {
        throw new ValidationError(`Free plan withdrawals are limited to ₱${FREE_PLAN_MAX_AMOUNT}. Upgrade your plan to withdraw more.`);
      }
      const { rows: wdCountRows } = await client.query(
        `SELECT COUNT(*) AS count FROM withdrawals
         WHERE user_id = $1 AND status NOT IN ('cancelled')`,
        [userId],
      );
      const existingCount = Number((wdCountRows[0] as { count: string }).count);
      if (existingCount >= FREE_PLAN_WITHDRAWAL_LIMIT) {
        throw new ForbiddenError(
          'Free plan users can only make 1 withdrawal in total. Upgrade your plan to continue withdrawing.',
          FREE_PLAN_UPGRADE_CODE,
        );
      }
    }

    // Premium & Elite: 24-hour cooldown between withdrawals
    if (user.plan === 'premium' || user.plan === 'elite') {
      const { rows: lastWdRows } = await client.query(
        `SELECT requested_at FROM withdrawals
         WHERE user_id = $1 AND status NOT IN ('cancelled')
         ORDER BY requested_at DESC LIMIT 1`,
        [userId],
      );
      if (lastWdRows.length > 0) {
        const lastRequestedAt = new Date((lastWdRows[0] as { requested_at: string }).requested_at);
        const cooldownEnd     = new Date(lastRequestedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
        if (new Date() < cooldownEnd) {
          const remaining = cooldownEnd.getTime() - Date.now();
          const hours     = Math.floor(remaining / (60 * 60 * 1000));
          const minutes   = Math.ceil((remaining % (60 * 60 * 1000)) / (60 * 1000));
          throw new ForbiddenError(
            `You have already made a withdrawal. You can withdraw again in ${hours}h ${minutes}m.`,
            COOLDOWN_CODE,
          );
        }
      }
    }

    // Deduct full requested amount from user balance
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [amount, userId],
    );

    const { rows } = await client.query(
      `INSERT INTO withdrawals (user_id, amount, fee_amount, net_amount, method, account_name, account_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, amount, fee_amount, net_amount, method, status, account_name, account_number, requested_at`,
      [userId, amount, feeAmount, netAmount, method, accountName, accountNumber],
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

// ─── Withdrawal cooldown status ───────────────────────────────────────────────

export async function getWithdrawalCooldown(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const { rows: userRows } = await pool.query(
      'SELECT plan FROM users WHERE id = $1',
      [userId],
    );
    if (!userRows.length) { res.json({ success: true, on_cooldown: false }); return; }

    const plan = (userRows[0] as { plan: string }).plan;

    // Only premium/elite have cooldown
    if (plan !== 'premium' && plan !== 'elite') {
      res.json({ success: true, on_cooldown: false });
      return;
    }

    const { rows: lastWdRows } = await pool.query(
      `SELECT requested_at FROM withdrawals
       WHERE user_id = $1 AND status NOT IN ('cancelled')
       ORDER BY requested_at DESC LIMIT 1`,
      [userId],
    );

    if (lastWdRows.length === 0) {
      res.json({ success: true, on_cooldown: false });
      return;
    }

    const lastRequestedAt = new Date((lastWdRows[0] as { requested_at: string }).requested_at);
    const cooldownEnd     = new Date(lastRequestedAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
    const now             = new Date();

    if (now < cooldownEnd) {
      const remaining = cooldownEnd.getTime() - now.getTime();
      res.json({
        success:      true,
        on_cooldown:  true,
        cooldown_end: cooldownEnd.toISOString(),
        remaining_ms: remaining,
      });
    } else {
      res.json({ success: true, on_cooldown: false });
    }
  } catch (err) { next(err); }
}

// ─── List user's own withdrawals ───────────────────────────────────────────────

export async function listWithdrawals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `SELECT id, amount, fee_amount, net_amount, method, status, account_name, account_number,
              rejection_reason, requested_at, processed_at
       FROM withdrawals
       WHERE user_id = $1
       ORDER BY requested_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user!.id, limit, offset],
    );

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) FROM withdrawals WHERE user_id = $1',
      [req.user!.id],
    );

    res.json({
      success: true,
      data: rows,
      meta: { page, limit, total: Number((countRows[0] as { count: string }).count) },
    });
  } catch (err) { next(err); }
}

// ─── Cancel a pending withdrawal (refunds full amount) ─────────────────────────

export async function cancelWithdrawal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;

    if (!/^\d+$/.test(id) || Number(id) < 1) throw new ValidationError('Invalid withdrawal id');

    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM withdrawals WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, userId],
    );
    if (rows.length === 0) throw new NotFoundError('Withdrawal not found');

    const withdrawal = rows[0] as Record<string, unknown>;
    if (withdrawal.status !== 'pending') {
      throw new ValidationError('Only pending withdrawals can be cancelled');
    }

    await client.query(
      'UPDATE withdrawals SET status = $1, processed_at = NOW() WHERE id = $2',
      ['cancelled', id],
    );

    // Refund the full requested amount (not net) — fee is waived on cancellation
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [withdrawal.amount, userId],
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Withdrawal cancelled and balance refunded.' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
