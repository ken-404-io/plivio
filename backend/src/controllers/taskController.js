import pool from '../config/db.js';
import { ForbiddenError, NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';

const PLAN_ORDER = { free: 0, premium: 1, elite: 2 };

// Daily earning caps in PHP. null = unlimited.
const DAILY_LIMIT = { free: 20, premium: 100, elite: null };

/** Returns the user's effective plan (accounts for expired subscriptions). */
async function getEffectivePlan(userId) {
  const { rows } = await pool.query(
    `SELECT u.plan, s.plan AS sub_plan, s.expires_at
     FROM users u
     LEFT JOIN subscriptions s
       ON s.user_id = u.id AND s.is_active = TRUE AND s.expires_at > NOW()
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) return 'free';
  const row = rows[0];
  return row.sub_plan ?? row.plan;
}

/** Sums rewards earned by a user today (UTC day). */
async function todayEarnings(userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(reward_earned), 0) AS total
     FROM task_completions
     WHERE user_id = $1
       AND status = 'approved'
       AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
    [userId]
  );
  return Number(rows[0].total);
}

// ─── List tasks ────────────────────────────────────────────────────────────

export async function listTasks(req, res, next) {
  try {
    const userId      = req.user.id;
    const effectivePlan = await getEffectivePlan(userId);
    const planRank    = PLAN_ORDER[effectivePlan] ?? 0;

    // Return only tasks the user's plan can access
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

    // Attach today's completion status for each task
    const completions = await pool.query(
      `SELECT DISTINCT task_id
       FROM task_completions
       WHERE user_id = $1
         AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [userId]
    );
    const completedToday = new Set(completions.rows.map((r) => r.task_id));

    const tasks = rows.map((t) => ({
      ...t,
      completed_today: completedToday.has(t.id),
    }));

    const earned  = await todayEarnings(userId);
    const limit   = DAILY_LIMIT[effectivePlan];

    res.json({
      success: true,
      tasks,
      today_earnings: earned,
      daily_limit:    limit,
      plan:           effectivePlan,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Complete a task ───────────────────────────────────────────────────────

export async function completeTask(req, res, next) {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const taskId = req.params.id;

    await client.query('BEGIN');

    // 1. Lock the user row to prevent concurrent reward races
    const userResult = await client.query(
      'SELECT id, is_banned FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (userResult.rowCount === 0) throw new NotFoundError('User not found');
    if (userResult.rows[0].is_banned) throw new ForbiddenError('Account suspended');

    const effectivePlan = await getEffectivePlan(userId);

    // 2. Fetch task
    const taskResult = await client.query(
      'SELECT id, title, reward_amount, min_plan, is_active FROM tasks WHERE id = $1',
      [taskId]
    );
    if (taskResult.rowCount === 0) throw new NotFoundError('Task not found');

    const task = taskResult.rows[0];
    if (!task.is_active) throw new ValidationError('This task is no longer available');

    // 3. Plan access check
    if (PLAN_ORDER[effectivePlan] < PLAN_ORDER[task.min_plan]) {
      throw new ForbiddenError(`This task requires a ${task.min_plan} plan or higher`);
    }

    // 4. Duplicate completion check (once per task per day)
    const dupCheck = await client.query(
      `SELECT id FROM task_completions
       WHERE user_id = $1
         AND task_id = $2
         AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
       LIMIT 1`,
      [userId, taskId]
    );
    if (dupCheck.rowCount > 0) {
      throw new ConflictError('You have already completed this task today');
    }

    // 5. Daily earning cap check
    const earned = await todayEarnings(userId);
    const cap    = DAILY_LIMIT[effectivePlan];
    if (cap !== null && earned + Number(task.reward_amount) > cap) {
      throw new ForbiddenError(
        `Daily earning limit of PHP ${cap} reached. Upgrade your plan to earn more.`
      );
    }

    // 6. Record completion and credit balance atomically
    await client.query(
      `INSERT INTO task_completions (user_id, task_id, reward_earned, status)
       VALUES ($1, $2, $3, 'approved')`,
      [userId, taskId, task.reward_amount]
    );

    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [task.reward_amount, userId]
    );

    await client.query('COMMIT');

    res.json({
      success:       true,
      reward_earned: task.reward_amount,
      message:       `PHP ${task.reward_amount} added to your balance`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
