import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ValidationError, ForbiddenError } from '../utils/errors.ts';

// ─── GET /api/coins ───────────────────────────────────────────────────────────
export async function getCoins(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    const { rows } = await pool.query<{
      coins: string;
      streak_count: number;
      last_streak_date: string | null;
      streak_broken_at: string | null;
      streak_before_break: number;
    }>(
      `SELECT coins, streak_count, last_streak_date, streak_broken_at, streak_before_break
       FROM users WHERE id = $1`,
      [userId],
    );

    if (!rows[0]) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    const u = rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const canRecover = u.streak_broken_at != null &&
      (u.streak_broken_at === today ||
        new Date(today).getTime() - new Date(u.streak_broken_at).getTime() <= 86_400_000);

    // Count tasks completed today for streak progress
    const { rows: taskRows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM task_completions
       WHERE user_id = $1
         AND status = 'approved'
         AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [userId],
    );
    const todayCompletions = Number(taskRows[0]?.count ?? 0);

    res.json({
      success: true,
      coins: Number(u.coins),
      streak_count: u.streak_count,
      last_streak_date: u.last_streak_date,
      streak_broken_at: u.streak_broken_at,
      streak_before_break: u.streak_before_break,
      can_recover: canRecover,
      today_completions: todayCompletions,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/coins/checkin ──────────────────────────────────────────────────
export async function checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    await client.query('BEGIN');

    const { rows } = await client.query<{
      coins: string;
      streak_count: number;
      last_streak_date: string | null;
    }>(
      'SELECT coins, streak_count, last_streak_date FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );

    if (!rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'User not found' }); return; }

    const u    = rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    // Already checked in today
    if (u.last_streak_date === today) {
      await client.query('ROLLBACK');
      res.json({
        success: false,
        already_checked_in: true,
        message: 'Already checked in today.',
        streak_count: u.streak_count,
      });
      return;
    }

    let newStreak = 1;
    let coinsAwarded = 0;
    let streakBroken = false;
    let streakBeforeBreak = 0;

    if (u.last_streak_date === yesterday) {
      // Continue streak
      newStreak = u.streak_count + 1;
    } else if (u.last_streak_date !== null) {
      // Streak broken — save old streak for potential recovery
      streakBroken = true;
      streakBeforeBreak = u.streak_count;
      newStreak = 1;
    }

    // Bonus on every 7th consecutive day
    const bonusDay = newStreak > 0 && newStreak % 7 === 0;
    if (bonusDay) {
      coinsAwarded = 50;
    }

    if (streakBroken) {
      await client.query(
        `UPDATE users
         SET streak_count = $1, last_streak_date = $2, streak_broken_at = $3,
             streak_before_break = $4
         WHERE id = $5`,
        [newStreak, today, today, streakBeforeBreak, userId],
      );
    } else {
      await client.query(
        `UPDATE users
         SET streak_count = $1, last_streak_date = $2,
             streak_broken_at = NULL, streak_before_break = 0
         WHERE id = $3`,
        [newStreak, today, userId],
      );
    }

    if (coinsAwarded > 0) {
      await client.query(
        'UPDATE users SET coins = coins + $1 WHERE id = $2',
        [coinsAwarded, userId],
      );
      await client.query(
        `INSERT INTO coin_transactions (user_id, type, amount, description)
         VALUES ($1, 'streak_bonus', $2, $3)`,
        [userId, coinsAwarded, `Day ${newStreak} streak bonus`],
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      streak_count: newStreak,
      streak_broken: streakBroken,
      coins_awarded: coinsAwarded,
      bonus_day: bonusDay,
      next_bonus_in: 7 - (newStreak % 7),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/coins/streak/recover ──────────────────────────────────────────
// body: { method: 'ad' | 'coins' }
export async function recoverStreak(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const { method } = req.body as { method: 'ad' | 'coins' };

    if (method !== 'ad' && method !== 'coins') {
      throw new ValidationError('method must be "ad" or "coins"');
    }

    await client.query('BEGIN');

    const { rows } = await client.query<{
      coins: string;
      streak_broken_at: string | null;
      streak_before_break: number;
    }>(
      'SELECT coins, streak_broken_at, streak_before_break FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );

    if (!rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'User not found' }); return; }

    const u     = rows[0];
    const today = new Date().toISOString().slice(0, 10);

    if (!u.streak_broken_at) {
      await client.query('ROLLBACK');
      throw new ValidationError('No broken streak to recover.');
    }

    const daysSinceBroken = Math.floor(
      (new Date(today).getTime() - new Date(u.streak_broken_at).getTime()) / 86_400_000,
    );
    if (daysSinceBroken > 1) {
      await client.query('ROLLBACK');
      throw new ValidationError('Recovery window has passed. You can only recover within 1 day.');
    }

    const RECOVERY_COST = 10;
    if (method === 'coins') {
      if (Number(u.coins) < RECOVERY_COST) {
        await client.query('ROLLBACK');
        throw new ForbiddenError(`Insufficient coins. Recovery costs ${RECOVERY_COST} coins.`);
      }
      await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [RECOVERY_COST, userId]);
      await client.query(
        `INSERT INTO coin_transactions (user_id, type, amount, description)
         VALUES ($1, 'streak_recovery', $2, 'Streak recovery (coins)')`,
        [userId, -RECOVERY_COST],
      );
    }
    // For 'ad' method: frontend plays the ad and signals completion; we trust the call

    const recoveredStreak = u.streak_before_break + 1; // +1 for today
    await client.query(
      `UPDATE users
       SET streak_count = $1, last_streak_date = $2, streak_broken_at = NULL, streak_before_break = 0
       WHERE id = $3`,
      [recoveredStreak, today, userId],
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      streak_count: recoveredStreak,
      coins_spent: method === 'coins' ? RECOVERY_COST : 0,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── POST /api/coins/convert ─────────────────────────────────────────────────
// body: { amount: number }  — converts coins to GCash payout request
export async function convertCoins(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const { amount } = req.body as { amount: number };

    if (!amount || typeof amount !== 'number' || amount < 50) {
      throw new ValidationError('Minimum conversion is 50 coins.');
    }
    if (amount > 10_000) {
      throw new ValidationError('Maximum conversion is 10,000 coins per request.');
    }

    await client.query('BEGIN');

    const { rows } = await client.query<{
      coins: string;
      kyc_status: string;
    }>(
      'SELECT coins, kyc_status FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );

    if (!rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'User not found' }); return; }

    const u = rows[0];

    if (u.kyc_status !== 'approved') {
      await client.query('ROLLBACK');
      throw new ForbiddenError('Identity verification required before converting coins.');
    }

    if (Number(u.coins) < amount) {
      await client.query('ROLLBACK');
      throw new ValidationError('Insufficient coins.');
    }

    const FEE_RATE    = 0.07;
    const payout      = Math.floor(amount * (1 - FEE_RATE) * 100) / 100; // 93%
    const feeAmount   = amount - payout;

    // Deduct coins
    await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [amount, userId]);
    await client.query(
      `INSERT INTO coin_transactions (user_id, type, amount, description)
       VALUES ($1, 'conversion', $2, $3)`,
      [userId, -amount, `Convert ${amount} coins → ₱${payout.toFixed(2)} GCash (7% fee)`],
    );

    // Create GCash withdrawal request for the net amount
    await client.query(
      `INSERT INTO withdrawals (user_id, amount, method, status)
       VALUES ($1, $2, 'gcash', 'pending')`,
      [userId, payout],
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      coins_spent: amount,
      fee_amount: feeAmount,
      payout_php: payout,
      message: `₱${payout.toFixed(2)} GCash withdrawal request submitted (7% fee applied).`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── GET /api/coins/transactions ─────────────────────────────────────────────
export async function getTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const page  = Math.max(1, Number(req.query['page']) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query['limit']) || 20));
    const offset = (page - 1) * limit;

    const { rows, rowCount } = await pool.query<{
      id: string;
      type: string;
      amount: string;
      description: string;
      created_at: string;
    }>(
      `SELECT id, type, amount, description, created_at
       FROM coin_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    const totalRes = await pool.query<{ count: string }>(
      'SELECT COUNT(*) FROM coin_transactions WHERE user_id = $1',
      [userId],
    );

    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
      meta: {
        page,
        limit,
        total: Number(totalRes.rows[0]?.count ?? 0),
        returned: rowCount ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
}
