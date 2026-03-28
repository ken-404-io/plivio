import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ForbiddenError, NotFoundError, ConflictError, ValidationError } from '../utils/errors.ts';

type PlanKey = 'free' | 'premium' | 'elite';

const PLAN_ORDER: Record<PlanKey, number> = { free: 0, premium: 1, elite: 2 };
const DAILY_LIMIT: Record<PlanKey, number | null> = { free: 20, premium: 100, elite: null };

async function getEffectivePlan(userId: string): Promise<PlanKey> {
  const { rows } = await pool.query(
    `SELECT u.plan, s.plan AS sub_plan, s.expires_at
     FROM users u
     LEFT JOIN subscriptions s
       ON s.user_id = u.id AND s.is_active = TRUE AND s.expires_at > NOW()
     WHERE u.id = $1 LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return 'free';
  const row = rows[0] as { plan: PlanKey; sub_plan: PlanKey | null };
  return row.sub_plan ?? row.plan;
}

async function todayEarnings(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(reward_earned), 0) AS total
     FROM task_completions
     WHERE user_id = $1
       AND status = 'approved'
       AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
    [userId]
  );
  return Number((rows[0] as { total: string }).total);
}

// ─── List tasks ────────────────────────────────────────────────────────────

export async function listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId        = req.user!.id;
    const effectivePlan = await getEffectivePlan(userId);
    const planRank      = PLAN_ORDER[effectivePlan] ?? 0;

    const { rows } = await pool.query(
      `SELECT id, title, type, reward_amount, min_plan
       FROM tasks
       WHERE is_active = TRUE
         AND CASE min_plan
               WHEN 'free'    THEN 0
               WHEN 'premium' THEN 1
               WHEN 'elite'   THEN 2
             END <= $1
       ORDER BY reward_amount DESC`,
      [planRank]
    );

    const completions = await pool.query(
      `SELECT DISTINCT task_id FROM task_completions
       WHERE user_id = $1 AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [userId]
    );
    const completedToday = new Set((completions.rows as { task_id: string }[]).map((r) => r.task_id));

    const tasks = (rows as Record<string, unknown>[]).map((t) => ({
      ...t,
      completed_today: completedToday.has(t.id as string),
    }));

    const earned = await todayEarnings(userId);
    const limit  = DAILY_LIMIT[effectivePlan];

    res.json({ success: true, tasks, today_earnings: earned, daily_limit: limit, plan: effectivePlan });
  } catch (err) { next(err); }
}

// ─── Complete a task ───────────────────────────────────────────────────────

export async function completeTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const taskId = req.params.id;

    await client.query('BEGIN');

    const userResult = await client.query('SELECT id, is_banned FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (userResult.rowCount === 0) throw new NotFoundError('User not found');
    if ((userResult.rows[0] as Record<string, unknown>).is_banned) throw new ForbiddenError('Account suspended');

    const effectivePlan = await getEffectivePlan(userId);

    const taskResult = await client.query(
      'SELECT id, title, reward_amount, min_plan, is_active FROM tasks WHERE id = $1',
      [taskId]
    );
    if (taskResult.rowCount === 0) throw new NotFoundError('Task not found');

    const task = taskResult.rows[0] as Record<string, unknown>;
    if (!task.is_active) throw new ValidationError('This task is no longer available');

    if (PLAN_ORDER[effectivePlan] < PLAN_ORDER[task.min_plan as PlanKey]) {
      throw new ForbiddenError(`This task requires a ${task.min_plan as string} plan or higher`);
    }

    const dupCheck = await client.query(
      `SELECT id FROM task_completions
       WHERE user_id = $1 AND task_id = $2
         AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') LIMIT 1`,
      [userId, taskId]
    );
    if (dupCheck.rowCount && dupCheck.rowCount > 0) throw new ConflictError('You have already completed this task today');

    const earned = await todayEarnings(userId);
    const cap    = DAILY_LIMIT[effectivePlan];
    if (cap !== null && earned + Number(task.reward_amount) > cap) {
      throw new ForbiddenError(`Daily earning limit of PHP ${cap} reached. Upgrade your plan to earn more.`);
    }

    await client.query(
      `INSERT INTO task_completions (user_id, task_id, reward_earned, status) VALUES ($1, $2, $3, 'approved')`,
      [userId, taskId, task.reward_amount]
    );
    await client.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [task.reward_amount, userId]);
    await client.query('COMMIT');

    res.json({
      success:       true,
      reward_earned: task.reward_amount,
      message:       `PHP ${task.reward_amount as string} added to your balance`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
