import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';

const REWARD_PER_CORRECT = 0.50;

const PLAN_QUESTION_LIMITS: Record<string, number> = {
  free:    50,
  premium: 150,
  elite:   500,
};

const DAILY_EARN_LIMITS: Record<string, number | null> = {
  free:    20,
  premium: 100,
  elite:   null,
};

// ─── GET /quiz/status ──────────────────────────────────────────────────────
export async function getQuizStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    // Get user plan (including active subscription)
    const planRes = await pool.query(
      `SELECT u.plan,
              CASE WHEN s.id IS NOT NULL THEN s.plan ELSE u.plan END AS effective_plan
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.expires_at > NOW()
       WHERE u.id = $1 LIMIT 1`,
      [userId],
    );
    const effectivePlan = (planRes.rows[0]?.effective_plan ?? 'free') as string;
    const questionLimit = PLAN_QUESTION_LIMITS[effectivePlan] ?? 50;
    const dailyLimit    = DAILY_EARN_LIMITS[effectivePlan];

    // Total questions answered (all time)
    const totalRes = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) AS correct,
              COALESCE(SUM(reward_earned), 0) AS total_earned
       FROM user_question_answers WHERE user_id = $1`,
      [userId],
    );

    // Today's earnings and answer count from quiz
    const todayRes = await pool.query(
      `SELECT COALESCE(SUM(reward_earned), 0) AS today_earned,
              COUNT(*) AS today_answered
       FROM user_question_answers
       WHERE user_id = $1 AND answered_at >= date_trunc('day', NOW())`,
      [userId],
    );

    // Total earnings today from ALL sources (tasks + quiz)
    const allTodayRes = await pool.query(
      `SELECT
        COALESCE((
          SELECT SUM(reward_earned) FROM task_completions
          WHERE user_id = $1 AND status = 'approved'
            AND completed_at >= date_trunc('day', NOW())
        ), 0) +
        COALESCE((
          SELECT SUM(reward_earned) FROM user_question_answers
          WHERE user_id = $1 AND answered_at >= date_trunc('day', NOW())
        ), 0) AS all_today_earned`,
      [userId],
    );

    const total         = parseInt(totalRes.rows[0]?.total ?? '0');
    const correct       = parseInt(totalRes.rows[0]?.correct ?? '0');
    const totalEarned   = parseFloat(totalRes.rows[0]?.total_earned ?? '0');
    const todayEarned   = parseFloat(todayRes.rows[0]?.today_earned ?? '0');
    const todayAnswered = parseInt(todayRes.rows[0]?.today_answered ?? '0');
    const allTodayEarned = parseFloat(allTodayRes.rows[0]?.all_today_earned ?? '0');

    const questionsLeft  = Math.max(0, questionLimit - total);
    const dailyRemaining = dailyLimit !== null
      ? Math.max(0, dailyLimit - allTodayEarned)
      : null;

    const canEarnMore = questionsLeft > 0 && (dailyRemaining === null || dailyRemaining > 0);

    res.json({
      success: true,
      plan: effectivePlan,
      question_limit:  questionLimit,
      total_answered:  total,
      total_correct:   correct,
      questions_left:  questionsLeft,
      total_earned:    totalEarned,
      today_earned:    todayEarned,
      today_answered:  todayAnswered,
      daily_limit:     dailyLimit,
      daily_remaining: dailyRemaining,
      can_earn_more:   canEarnMore,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /quiz/next ────────────────────────────────────────────────────────
export async function getNextQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    // Get effective plan
    const planRes = await pool.query(
      `SELECT CASE WHEN s.id IS NOT NULL THEN s.plan ELSE u.plan END AS effective_plan
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.expires_at > NOW()
       WHERE u.id = $1 LIMIT 1`,
      [userId],
    );
    const effectivePlan  = (planRes.rows[0]?.effective_plan ?? 'free') as string;
    const questionLimit  = PLAN_QUESTION_LIMITS[effectivePlan] ?? 50;
    const dailyLimit     = DAILY_EARN_LIMITS[effectivePlan];

    // Count total answered
    const countRes = await pool.query(
      `SELECT COUNT(*) AS total FROM user_question_answers WHERE user_id = $1`,
      [userId],
    );
    const totalAnswered = parseInt(countRes.rows[0]?.total ?? '0');

    if (totalAnswered >= questionLimit) {
      res.json({
        success: false,
        reason:  'limit_reached',
        message: `You have reached your ${effectivePlan} plan limit of ${questionLimit} questions. Upgrade to answer more!`,
      });
      return;
    }

    // Check daily earning limit
    if (dailyLimit !== null) {
      const allTodayRes = await pool.query(
        `SELECT
          COALESCE((
            SELECT SUM(reward_earned) FROM task_completions
            WHERE user_id = $1 AND status = 'approved'
              AND completed_at >= date_trunc('day', NOW())
          ), 0) +
          COALESCE((
            SELECT SUM(reward_earned) FROM user_question_answers
            WHERE user_id = $1 AND answered_at >= date_trunc('day', NOW())
          ), 0) AS all_today_earned`,
        [userId],
      );
      const allTodayEarned = parseFloat(allTodayRes.rows[0]?.all_today_earned ?? '0');
      if (allTodayEarned >= dailyLimit) {
        res.json({
          success: false,
          reason:  'daily_limit_reached',
          message: `You have reached your daily earning limit of ₱${dailyLimit}. Come back tomorrow!`,
        });
        return;
      }
    }

    // Get next unanswered question (random from unanswered pool)
    const questionRes = await pool.query(
      `SELECT q.id, q.question, q.category
       FROM chat_questions q
       WHERE q.id NOT IN (
         SELECT question_id FROM user_question_answers WHERE user_id = $1
       )
       ORDER BY RANDOM()
       LIMIT 1`,
      [userId],
    );

    if (questionRes.rowCount === 0) {
      res.json({
        success: false,
        reason:  'no_questions',
        message: 'No more questions available.',
      });
      return;
    }

    const question = questionRes.rows[0];
    res.json({
      success:  true,
      question: {
        id:       question.id,
        question: question.question,
        category: question.category,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /quiz/answer ─────────────────────────────────────────────────────
export async function submitAnswer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { question_id, answer } = req.body as { question_id: number; answer: string };

    if (!question_id || answer === undefined || answer === null) {
      res.status(400).json({ success: false, error: 'question_id and answer are required.' });
      return;
    }

    // Get the question and correct answer
    const questionRes = await pool.query(
      `SELECT id, question, answer, category FROM chat_questions WHERE id = $1`,
      [question_id],
    );

    if (questionRes.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Question not found.' });
      return;
    }

    // Check not already answered
    const alreadyRes = await pool.query(
      `SELECT id FROM user_question_answers WHERE user_id = $1 AND question_id = $2`,
      [userId, question_id],
    );
    if (alreadyRes.rowCount && alreadyRes.rowCount > 0) {
      res.status(400).json({ success: false, error: 'Already answered this question.' });
      return;
    }

    // Get effective plan and check limits
    const planRes = await pool.query(
      `SELECT CASE WHEN s.id IS NOT NULL THEN s.plan ELSE u.plan END AS effective_plan
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.expires_at > NOW()
       WHERE u.id = $1 LIMIT 1`,
      [userId],
    );
    const effectivePlan = (planRes.rows[0]?.effective_plan ?? 'free') as string;
    const questionLimit = PLAN_QUESTION_LIMITS[effectivePlan] ?? 50;
    const dailyLimit    = DAILY_EARN_LIMITS[effectivePlan];

    const countRes = await pool.query(
      `SELECT COUNT(*) AS total FROM user_question_answers WHERE user_id = $1`,
      [userId],
    );
    const totalAnswered = parseInt(countRes.rows[0]?.total ?? '0');
    if (totalAnswered >= questionLimit) {
      res.status(403).json({ success: false, error: 'Question limit reached for your plan.' });
      return;
    }

    // Check correctness (case-insensitive, trimmed)
    const correctAnswer = questionRes.rows[0].answer as string;
    const userAnswer    = String(answer).trim();
    const isCorrect     = userAnswer.toLowerCase() === correctAnswer.toLowerCase();

    let rewardEarned = 0;

    if (isCorrect) {
      // Check daily limit before awarding
      if (dailyLimit !== null) {
        const allTodayRes = await pool.query(
          `SELECT
            COALESCE((
              SELECT SUM(reward_earned) FROM task_completions
              WHERE user_id = $1 AND status = 'approved'
                AND completed_at >= date_trunc('day', NOW())
            ), 0) +
            COALESCE((
              SELECT SUM(reward_earned) FROM user_question_answers
              WHERE user_id = $1 AND answered_at >= date_trunc('day', NOW())
            ), 0) AS all_today_earned`,
          [userId],
        );
        const allTodayEarned = parseFloat(allTodayRes.rows[0]?.all_today_earned ?? '0');
        if (allTodayEarned < dailyLimit) {
          rewardEarned = Math.min(REWARD_PER_CORRECT, dailyLimit - allTodayEarned);
        }
      } else {
        rewardEarned = REWARD_PER_CORRECT;
      }
    }

    // Save answer in transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO user_question_answers (user_id, question_id, user_answer, is_correct, reward_earned)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, question_id, userAnswer, isCorrect, rewardEarned],
      );
      if (rewardEarned > 0) {
        await client.query(
          `UPDATE users SET balance = balance + $1 WHERE id = $2`,
          [rewardEarned, userId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      success:       true,
      is_correct:    isCorrect,
      correct_answer: correctAnswer,
      reward_earned: rewardEarned,
      message: isCorrect
        ? `Correct! ₱${rewardEarned.toFixed(2)} added to your balance.`
        : `Wrong! The correct answer is: ${correctAnswer}`,
    });
  } catch (err) {
    next(err);
  }
}
