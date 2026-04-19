import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ValidationError, ForbiddenError, NotFoundError } from '../utils/errors.ts';

const FREE_PLAN_WITHDRAWAL_LIMIT    = 1;
const FREE_PLAN_MIN_AMOUNT          = 400;  // ₱400 minimum payout for Free plan
const FREE_PLAN_MAX_AMOUNT          = 5000; // no hard cap beyond global max
const FREE_PLAN_UPGRADE_CODE        = 'free_plan_limit_reached';
const PREMIUM_MIN_AMOUNT            = 500;  // ₱500 minimum payout for Premium
const PREMIUM_DAILY_WITHDRAWAL_MAX  = 5000; // ₱5000 daily cap for Premium
const ELITE_MIN_AMOUNT              = 1500; // ₱1,500 minimum payout for Elite
const ELITE_DAILY_WITHDRAWAL_MAX    = 5000; // ₱5000 daily cap for Elite
// SQL snippet: start of "today" in Philippine Standard Time (UTC+8)
const SQL_PH_DAY_START = `(date_trunc('day', (NOW() AT TIME ZONE 'Asia/Manila')) AT TIME ZONE 'Asia/Manila')`;

// Minimum quiz earnings (₱) a user must accumulate today before they can withdraw.
// Resets at 12am Philippine time. Free plan users who have exhausted their 100-question lifetime bank are exempt.
const QUIZ_EARN_GATE_DEFAULT = 60;
const QUIZ_EARN_GATE_PREMIUM = 90;
const QUIZ_EARN_GATE_ELITE   = 200;
const FREE_PLAN_LIFETIME_CAP = 100;

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

    const amount            = Number(body.amount);
    const paymentMethodId   = typeof body.payment_method_id === 'string'
      ? body.payment_method_id.trim()
      : '';

    let method        = String(body.method ?? '').toLowerCase();
    let accountName   = String(body.account_name   ?? '').trim();
    let accountNumber = String(body.account_number ?? '').trim();

    // ── Amount validation ───────────────────────────────────────────────────
    if (amount < MIN_WITHDRAWAL) {
      throw new ValidationError(`Minimum withdrawal is ₱${MIN_WITHDRAWAL}`);
    }
    if (amount > MAX_WITHDRAWAL) {
      throw new ValidationError(`Maximum withdrawal per request is ₱${MAX_WITHDRAWAL}`);
    }

    // ── Resolve payment details from saved method if provided ──────────────
    // Users who have saved a payment method can send just `payment_method_id`.
    // We look up the stored (method, account_name, account_number) tuple and
    // use that as the source of truth, so the account the user saved and
    // verified is exactly what ends up on the withdrawal record.
    if (paymentMethodId) {
      const { rows: pmRows } = await pool.query(
        `SELECT method, account_name, account_number
         FROM payment_methods
         WHERE id = $1 AND user_id = $2`,
        [paymentMethodId, userId],
      );
      if (!pmRows.length) {
        throw new ValidationError('Selected payment method not found. Please pick another.');
      }
      const pm = pmRows[0] as {
        method: string;
        account_name: string;
        account_number: string;
      };
      method        = pm.method;
      accountName   = pm.account_name;
      accountNumber = pm.account_number;
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

    // Quiz earn gate — must earn at least the plan's threshold from Quizly today before withdrawing.
    // Free users who've exhausted their 100-question lifetime bank are exempt.
    {
      const quizEarnGate = user.plan === 'elite' ? QUIZ_EARN_GATE_ELITE : user.plan === 'premium' ? QUIZ_EARN_GATE_PREMIUM : QUIZ_EARN_GATE_DEFAULT;
      const { rows: quizRows } = await client.query(
        `SELECT COALESCE(SUM(reward_earned), 0) AS today_earned FROM user_question_answers
         WHERE user_id = $1 AND answered_at >= ${SQL_PH_DAY_START}`,
        [userId],
      );
      const todayEarned = Number((quizRows[0] as { today_earned: string }).today_earned);

      if (todayEarned < quizEarnGate) {
        let exempt = false;
        if (user.plan === 'free') {
          const { rows: lifeRows } = await client.query(
            `SELECT COUNT(*) AS total FROM user_question_answers WHERE user_id = $1`,
            [userId],
          );
          if (Number((lifeRows[0] as { total: string }).total) >= FREE_PLAN_LIFETIME_CAP) exempt = true;
        }
        if (!exempt) {
          const remaining = (quizEarnGate - todayEarned).toFixed(2);
          throw new ForbiddenError(
            `Earn ₱${quizEarnGate} in Quizly today to unlock your withdrawal. You need ₱${remaining} more.`,
            'quiz_gate_not_met',
          );
        }
      }
    }

    if (Number(user.balance) < amount) {
      throw new ValidationError(`Insufficient balance. Available: ₱${Number(user.balance).toFixed(2)}`);
    }

    // Free plan: min ₱400 per withdrawal and limited to 1 total
    if (user.plan === 'free') {
      if (amount < FREE_PLAN_MIN_AMOUNT) {
        throw new ValidationError(`Free plan minimum payout is ₱${FREE_PLAN_MIN_AMOUNT}.`);
      }
      if (amount > FREE_PLAN_MAX_AMOUNT) {
        throw new ValidationError(`Free plan withdrawals cannot exceed ₱${FREE_PLAN_MAX_AMOUNT}.`);
      }
      const { rows: wdCountRows } = await client.query(
        `SELECT COUNT(*) AS count FROM withdrawals
         WHERE user_id = $1 AND status NOT IN ('cancelled', 'rejected')`,
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

    // Premium: min ₱500 per withdrawal, ₱5,000/day total limit
    if (user.plan === 'premium') {
      if (amount < PREMIUM_MIN_AMOUNT) {
        throw new ValidationError(`Premium plan minimum payout is ₱${PREMIUM_MIN_AMOUNT}.`);
      }
      const { rows: todayRows } = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS today_total
         FROM withdrawals
         WHERE user_id = $1
           AND status NOT IN ('cancelled')
           AND requested_at >= ${SQL_PH_DAY_START}`,
        [userId],
      );
      const todayTotal = Number((todayRows[0] as { today_total: string }).today_total);
      if (todayTotal + amount > PREMIUM_DAILY_WITHDRAWAL_MAX) {
        const remaining = Math.max(0, PREMIUM_DAILY_WITHDRAWAL_MAX - todayTotal);
        throw new ForbiddenError(
          `Premium plan daily withdrawal limit is ₱${PREMIUM_DAILY_WITHDRAWAL_MAX}. ` +
          `You have ₱${remaining.toFixed(2)} remaining today.`,
        );
      }
    }

    // Elite: min ₱1,500 per withdrawal, ₱5,000/day total limit
    if (user.plan === 'elite') {
      if (amount < ELITE_MIN_AMOUNT) {
        throw new ValidationError(`Elite plan minimum payout is ₱${ELITE_MIN_AMOUNT}.`);
      }
      const { rows: todayRows } = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS today_total
         FROM withdrawals
         WHERE user_id = $1
           AND status NOT IN ('cancelled')
           AND requested_at >= ${SQL_PH_DAY_START}`,
        [userId],
      );
      const todayTotal = Number((todayRows[0] as { today_total: string }).today_total);
      if (todayTotal + amount > ELITE_DAILY_WITHDRAWAL_MAX) {
        const remaining = Math.max(0, ELITE_DAILY_WITHDRAWAL_MAX - todayTotal);
        throw new ForbiddenError(
          `Elite plan daily withdrawal limit is ₱${ELITE_DAILY_WITHDRAWAL_MAX}. ` +
          `You have ₱${remaining.toFixed(2)} remaining today.`,
        );
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

    // Quiz earn gate status — shared across all plans
    const [quizTodayRes, quizLifetimeRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(reward_earned), 0) AS today_earned FROM user_question_answers
         WHERE user_id = $1 AND answered_at >= ${SQL_PH_DAY_START}`,
        [userId],
      ),
      plan === 'free'
        ? pool.query(`SELECT COUNT(*) AS total FROM user_question_answers WHERE user_id = $1`, [userId])
        : Promise.resolve({ rows: [{ total: '0' }] }),
    ]);
    const quizTodayEarned   = Number((quizTodayRes.rows[0] as { today_earned: string }).today_earned);
    const quizLifetimeTotal = Number((quizLifetimeRes.rows[0] as { total: string }).total);

    const quizEarnGate   = plan === 'elite' ? QUIZ_EARN_GATE_ELITE : plan === 'premium' ? QUIZ_EARN_GATE_PREMIUM : QUIZ_EARN_GATE_DEFAULT;
    const freeExempt     = plan === 'free' && quizLifetimeTotal >= FREE_PLAN_LIFETIME_CAP;
    const quizGatePassed = quizTodayEarned >= quizEarnGate || freeExempt;

    const quizInfo = {
      quiz_earn_gate:      quizEarnGate,
      quiz_today_earned:   quizTodayEarned,
      quiz_gate_passed:    quizGatePassed,
    };

    // Premium: return today's used and remaining daily withdrawal allowance
    if (plan === 'premium') {
      const { rows: todayRows } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS today_total
         FROM withdrawals
         WHERE user_id = $1
           AND status NOT IN ('cancelled')
           AND requested_at >= ${SQL_PH_DAY_START}`,
        [userId],
      );
      const todayTotal = Number((todayRows[0] as { today_total: string }).today_total);
      const remaining  = Math.max(0, PREMIUM_DAILY_WITHDRAWAL_MAX - todayTotal);
      res.json({
        success:          true,
        on_cooldown:      false,
        daily_limit:      PREMIUM_DAILY_WITHDRAWAL_MAX,
        min_amount:       PREMIUM_MIN_AMOUNT,
        today_withdrawn:  todayTotal,
        daily_remaining:  remaining,
        ...quizInfo,
      });
      return;
    }

    // Elite: return today's used and remaining daily withdrawal allowance
    if (plan === 'elite') {
      const { rows: todayRows } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS today_total
         FROM withdrawals
         WHERE user_id = $1
           AND status NOT IN ('cancelled')
           AND requested_at >= ${SQL_PH_DAY_START}`,
        [userId],
      );
      const todayTotal = Number((todayRows[0] as { today_total: string }).today_total);
      const remaining  = Math.max(0, ELITE_DAILY_WITHDRAWAL_MAX - todayTotal);
      res.json({
        success:          true,
        on_cooldown:      false,
        daily_limit:      ELITE_DAILY_WITHDRAWAL_MAX,
        min_amount:       ELITE_MIN_AMOUNT,
        today_withdrawn:  todayTotal,
        daily_remaining:  remaining,
        ...quizInfo,
      });
      return;
    }

    // Free plan: report whether the 1-withdrawal slot is still available
    if (plan === 'free') {
      const { rows: freeWdRows } = await pool.query(
        `SELECT COUNT(*) AS count FROM withdrawals
         WHERE user_id = $1 AND status NOT IN ('cancelled', 'rejected')`,
        [userId],
      );
      const usedCount = Number((freeWdRows[0] as { count: string }).count);
      res.json({
        success:               true,
        on_cooldown:           false,
        free_withdrawal_used:  usedCount >= FREE_PLAN_WITHDRAWAL_LIMIT,
        free_withdrawal_limit: FREE_PLAN_WITHDRAWAL_LIMIT,
        min_amount:            FREE_PLAN_MIN_AMOUNT,
        ...quizInfo,
      });
      return;
    }

    res.json({ success: true, on_cooldown: false, ...quizInfo });
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
