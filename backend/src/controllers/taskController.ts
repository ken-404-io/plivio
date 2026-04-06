import bcrypt from 'bcrypt';
import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ForbiddenError, NotFoundError, ConflictError, ValidationError } from '../utils/errors.ts';
import { createNotification } from '../utils/notify.ts';
import { sendPushToUser }    from '../controllers/pushController.ts';

// ─── Types ─────────────────────────────────────────────────────────────────

type PlanKey = 'free' | 'premium' | 'elite';

interface SurveyQuestion {
  id: string;
  text: string;
  min_length: number;
}

interface AdNetwork {
  name: string;
  weight: number;
  embed_code: string;
}

interface VerificationConfig {
  type: string;
  duration_seconds?: number;
  questions?: SurveyQuestion[];
  auto?: boolean;
  networks?: AdNetwork[];
}

/** Weighted random selection from configured ad networks. */
function selectNetwork(networks: AdNetwork[]): AdNetwork | null {
  if (!networks.length) return null;
  const total  = networks.reduce((s, n) => s + (n.weight || 1), 0);
  let   cursor = Math.random() * total;
  for (const n of networks) {
    cursor -= n.weight || 1;
    if (cursor <= 0) return n;
  }
  return networks[networks.length - 1];
}

interface TaskRow {
  id: string;
  title: string;
  type: string;
  reward_amount: string;
  min_plan: PlanKey;
  is_active: boolean;
  verification_config: VerificationConfig;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PLAN_ORDER: Record<PlanKey, number>      = { free: 0, premium: 1, elite: 2 };
const DAILY_LIMIT: Record<PlanKey, number | null> = { free: 20, premium: 100, elite: null };

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getEffectivePlan(userId: string): Promise<PlanKey> {
  const { rows } = await pool.query(
    `SELECT u.plan, s.plan AS sub_plan
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

/** Generate a simple math captcha challenge. Returns the question and a bcrypt hash of the answer. */
async function generateCaptcha(): Promise<{ question: string; answerHash: string }> {
  const ops = ['+', '-', 'x'] as const;
  const op  = ops[Math.floor(Math.random() * ops.length)];

  let a: number, b: number, answer: number;

  if (op === '+') {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 20) + 10;
    b = Math.floor(Math.random() * 10) + 1;
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 9) + 2;
    b = Math.floor(Math.random() * 9) + 2;
    answer = a * b;
  }

  const answerHash = await bcrypt.hash(String(answer), 8);
  return { question: `What is ${a} ${op} ${b}?`, answerHash };
}

// ─── List tasks ────────────────────────────────────────────────────────────

export async function listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId        = req.user!.id;
    const effectivePlan = await getEffectivePlan(userId);
    const planRank      = PLAN_ORDER[effectivePlan] ?? 0;

    const { rows } = await pool.query(
      `SELECT id, title, type, reward_amount, min_plan, verification_config
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

    // Fetch today's completions (pending + approved) to mark task states
    const completions = await pool.query(
      `SELECT task_id, status
       FROM task_completions
       WHERE user_id = $1
         AND started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
         AND status IN ('pending', 'approved')`,
      [userId]
    );

    const pendingToday  = new Set<string>();
    const approvedToday = new Set<string>();
    for (const row of completions.rows as { task_id: string; status: string }[]) {
      if (row.status === 'pending')  pendingToday.add(row.task_id);
      if (row.status === 'approved') approvedToday.add(row.task_id);
    }

    const tasks = (rows as TaskRow[]).map((t) => ({
      ...t,
      completed_today:   approvedToday.has(t.id),
      in_progress_today: pendingToday.has(t.id),
    }));

    const earned = await todayEarnings(userId);
    const limit  = DAILY_LIMIT[effectivePlan];

    res.json({ success: true, tasks, today_earnings: earned, daily_limit: limit, plan: effectivePlan });
  } catch (err) { next(err); }
}

// ─── Start a task ──────────────────────────────────────────────────────────

export async function startTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const taskId = req.params["id"] as string;

    await client.query('BEGIN');

    // Verify user is active
    const userResult = await client.query(
      'SELECT id, is_banned FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (userResult.rowCount === 0) throw new NotFoundError('User not found');
    if ((userResult.rows[0] as { is_banned: boolean }).is_banned) {
      throw new ForbiddenError('Account suspended');
    }

    const effectivePlan = await getEffectivePlan(userId);

    // Fetch task with verification config
    const taskResult = await client.query(
      'SELECT id, title, type, reward_amount, min_plan, is_active, verification_config FROM tasks WHERE id = $1',
      [taskId]
    );
    if (taskResult.rowCount === 0) throw new NotFoundError('Task not found');

    const task = taskResult.rows[0] as TaskRow;
    if (!task.is_active) throw new ValidationError('This task is no longer available');

    if (PLAN_ORDER[effectivePlan] < PLAN_ORDER[task.min_plan]) {
      throw new ForbiddenError(`This task requires a ${task.min_plan} plan or higher`);
    }

    // Block if already started or completed today
    const dupCheck = await client.query(
      `SELECT id FROM task_completions
       WHERE user_id = $1 AND task_id = $2
         AND started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
         AND status IN ('pending', 'approved')
       LIMIT 1`,
      [userId, taskId]
    );
    if (dupCheck.rowCount && dupCheck.rowCount > 0) {
      throw new ConflictError('You have already started or completed this task today');
    }

    // Check daily earning cap
    const earned = await todayEarnings(userId);
    const cap    = DAILY_LIMIT[effectivePlan];
    if (cap !== null && earned + Number(task.reward_amount) > cap) {
      throw new ForbiddenError(`Daily earning limit of PHP ${cap} reached. Upgrade your plan to earn more.`);
    }

    // Referral tasks are auto-handled on registration — not manually startable
    const config: VerificationConfig = task.verification_config ?? { type: task.type };
    if (config.type === 'referral' || task.type === 'referral') {
      throw new ValidationError('Referral rewards are issued automatically when a friend registers using your code.');
    }

    // Generate captcha challenge or select ad network
    let serverData: Record<string, unknown> = {};
    let challenge: Record<string, string>   = {};
    let embedCode: string | undefined;

    if (task.type === 'captcha') {
      const captcha           = await generateCaptcha();
      serverData.captcha_hash = captcha.answerHash;
      challenge.question      = captcha.question;
    }

    if (task.type === 'video' || task.type === 'ad_click') {
      const networks = (config.networks ?? []).filter((n) => n.embed_code?.trim());
      if (networks.length > 0) {
        const picked              = selectNetwork(networks);
        serverData.selected_network = picked?.name ?? '';
        embedCode                   = picked?.embed_code ?? '';
      }
    }

    // Insert pending completion — completed_at is intentionally NULL until approved
    const insertResult = await client.query(
      `INSERT INTO task_completions (user_id, task_id, started_at, completed_at, status, server_data, proof)
       VALUES ($1, $2, NOW(), NULL, 'pending', $3, '{}')
       RETURNING id`,
      [userId, taskId, JSON.stringify(serverData)]
    );

    const completionId = (insertResult.rows[0] as { id: string }).id;

    await client.query('COMMIT');

    res.json({
      success:             true,
      completion_id:       completionId,
      verification_config: config,
      ...(Object.keys(challenge).length > 0 && { challenge }),
      ...(embedCode                           && { embed_code: embedCode }),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── Submit task proof ─────────────────────────────────────────────────────

export async function submitTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const userId       = req.user!.id;
    const taskId       = req.params["id"] as string;
    const { completion_id, proof = {} } = req.body as {
      completion_id: string;
      proof: Record<string, unknown>;
    };

    if (!completion_id) throw new ValidationError('completion_id is required');

    await client.query('BEGIN');

    // Fetch the pending completion — must belong to this user and task, started today
    const compResult = await client.query(
      `SELECT tc.id, tc.started_at, tc.server_data,
              t.type, t.reward_amount, t.title, t.verification_config
       FROM task_completions tc
       JOIN tasks t ON t.id = tc.task_id
       WHERE tc.id = $1 AND tc.user_id = $2 AND tc.task_id = $3
         AND tc.status = 'pending'
         AND tc.started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
       LIMIT 1`,
      [completion_id, userId, taskId]
    );

    if (!compResult.rowCount || compResult.rowCount === 0) {
      throw new NotFoundError('No active task session found. Please start the task again.');
    }

    const comp = compResult.rows[0] as {
      id: string;
      started_at: Date;
      server_data: Record<string, unknown>;
      type: string;
      reward_amount: string;
      title: string;
      verification_config: VerificationConfig;
    };

    const config: VerificationConfig = comp.verification_config ?? { type: comp.type };
    const elapsedSeconds = (Date.now() - new Date(comp.started_at).getTime()) / 1000;

    // ── Type-specific verification ──────────────────────────────────────────

    if (comp.type === 'video' || comp.type === 'ad_click') {
      const required = config.duration_seconds ?? (comp.type === 'video' ? 30 : 10);
      if (elapsedSeconds < required) {
        const remaining = Math.ceil(required - elapsedSeconds);
        throw new ValidationError(
          `You must complete the full ${required}s view. Wait ${remaining} more second${remaining !== 1 ? 's' : ''}.`
        );
      }
    }

    if (comp.type === 'captcha') {
      const submittedAnswer = String(proof.answer ?? '').trim();
      if (!submittedAnswer) throw new ValidationError('Captcha answer is required.');

      const storedHash = comp.server_data.captcha_hash as string | undefined;
      if (!storedHash) throw new ValidationError('Captcha session expired. Please start again.');

      const correct = await bcrypt.compare(submittedAnswer, storedHash);
      if (!correct) {
        // Mark as rejected so the user must start fresh
        await client.query(
          `UPDATE task_completions SET status = 'rejected', completed_at = NOW() WHERE id = $1`,
          [comp.id]
        );
        await client.query('COMMIT');
        res.status(400).json({ success: false, error: 'Incorrect captcha answer. Please try again.' });
        return;
      }
    }

    if (comp.type === 'survey') {
      const questions = config.questions ?? [];
      if (questions.length === 0) throw new ValidationError('Survey configuration is missing.');

      const answers = proof.answers as Record<string, string> | undefined;
      if (!answers) throw new ValidationError('Survey answers are required.');

      for (const q of questions) {
        const answer = String(answers[q.id] ?? '').trim();
        if (answer.length < q.min_length) {
          throw new ValidationError(
            `Answer for "${q.text}" must be at least ${q.min_length} characters. You wrote ${answer.length}.`
          );
        }
      }
    }

    // ── Approve the completion ──────────────────────────────────────────────

    await client.query(
      `UPDATE task_completions
       SET status = 'approved', completed_at = NOW(), reward_earned = $1, proof = $2
       WHERE id = $3`,
      [comp.reward_amount, JSON.stringify(proof), comp.id]
    );

    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [comp.reward_amount, userId]
    );

    await client.query('COMMIT');

    // Non-blocking notifications — must not affect response
    const notifTitle = 'Task Completed!';
    const notifBody  = `₱${Number(comp.reward_amount).toFixed(2)} added for "${comp.title}".`;
    void createNotification(userId, 'task_approved', notifTitle, notifBody, '/earnings');
    void sendPushToUser(userId, notifTitle, notifBody, '/earnings');

    res.json({
      success:       true,
      reward_earned: comp.reward_amount,
      message:       `₱${Number(comp.reward_amount).toFixed(2)} added to your balance!`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── Cancel a task (user closed before completing) ─────────────────────────

export async function cancelTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const taskId = req.params["id"] as string;

    // Mark any pending completion for this task today as rejected
    await pool.query(
      `UPDATE task_completions
       SET status = 'rejected', completed_at = NOW()
       WHERE user_id = $1 AND task_id = $2
         AND status = 'pending'
         AND started_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [userId, taskId]
    );

    res.json({ success: true });
  } catch (err) { next(err); }
}
