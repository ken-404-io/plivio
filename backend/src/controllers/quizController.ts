import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';

const REWARD_PER_CORRECT = 0.10;

// Lifetime question cap — Free plan users have a hard ceiling of 5,000 total
// questions. Premium and Elite users have NO lifetime cap; their counters
// are daily (reset at 00:00 Philippine Standard Time).
const FREE_LIFETIME_QUESTIONS = 5000;

// Cooldown window before a previously-answered question becomes eligible
// again for the same user. Without this, heavy users — especially Elite,
// who have no daily cap — burn through the entire question bank and hit
// a permanent "No more questions available" dead end. With the window,
// a question the user hasn't seen in this many days can be served again.
// Enforced here in the application layer; the DB's UNIQUE(user_id,
// question_id) constraint was dropped in migration 017.
//
// This is a trusted compile-time constant, so it's string-interpolated
// into the SQL interval literal (node-postgres can't parameterise
// INTERVAL values cleanly across integer/text type boundaries).
const QUESTION_RECYCLE_DAYS = 1;
const RECYCLE_INTERVAL_SQL  = `INTERVAL '${QUESTION_RECYCLE_DAYS} days'`;

// Daily question cap (resets 00:00 PST / Asia/Manila). null = unlimited.
const DAILY_QUESTION_LIMITS: Record<string, number | null> = {
  free:    null,     // Free uses the lifetime cap above
  premium: 10000,
  elite:   null,     // Unlimited daily
};

// Daily earning cap from the quiz bot (₱). null = unlimited.
// For Free plan, the 5,000 lifetime question cap is the natural limiter.
// Note: referral earnings are NOT counted against this cap.
const DAILY_EARN_LIMITS: Record<string, number | null> = {
  free:    null,
  premium: 400,
  elite:   1000,
};

// ─── SQL snippet: "today" in Philippine Standard Time (UTC+8) ──────────────
// `answered_at` is TIMESTAMPTZ, so we compare against 00:00 Asia/Manila
// converted back to an absolute instant.
const SQL_PH_DAY_START = `(date_trunc('day', (NOW() AT TIME ZONE 'Asia/Manila')) AT TIME ZONE 'Asia/Manila')`;

// Look up the currently-active promotion for a given plan. Returns null if
// none. Migration 024 adds the promotions table; answers during the window
// are tagged with promo_id so the baseline lifetime counter (which excludes
// promo-tagged rows) is automatically restored when the window closes.
async function getActivePromo(plan: string): Promise<{
  id: number;
  bonus_questions: number;
  lift_free_earn_cap: boolean;
  ends_at: string;
} | null> {
  const { rows } = await pool.query(
    `SELECT id, bonus_questions, lift_free_earn_cap, ends_at
     FROM promotions
     WHERE applies_to_plan = $1
       AND starts_at <= NOW()
       AND ends_at   >  NOW()
     ORDER BY ends_at ASC
     LIMIT 1`,
    [plan],
  );
  return rows[0] ?? null;
}

// ─── GET /quiz/status ──────────────────────────────────────────────────────
export async function getQuizStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    // Get user plan (including active subscription)
    const planRes = await pool.query(
      `SELECT u.plan,
              CASE WHEN s.id IS NOT NULL THEN s.plan ELSE u.plan END AS effective_plan
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.is_active = TRUE AND s.expires_at > NOW()
       WHERE u.id = $1 LIMIT 1`,
      [userId],
    );
    const effectivePlan = (planRes.rows[0]?.effective_plan ?? 'free') as string;
    const dailyQuestionLimit = DAILY_QUESTION_LIMITS[effectivePlan] ?? null;
    let   dailyEarnLimit     = DAILY_EARN_LIMITS[effectivePlan] ?? null;

    // Active promotion (if any) for this plan — grants bonus questions and
    // optionally lifts the daily earn cap. Answers submitted while a promo
    // is active are tagged with its id so baseline state is preserved.
    const activePromo = await getActivePromo(effectivePlan);
    if (activePromo && activePromo.lift_free_earn_cap) {
      dailyEarnLimit = null;
    }

    // Lifetime answered (used for Free plan cap).
    // Exclude promo-tagged answers from the baseline so the user's real
    // lifetime counter is unaffected by promo activity.
    const lifetimeRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE promo_id IS NULL) AS total,
         SUM(CASE WHEN is_correct AND promo_id IS NULL THEN 1 ELSE 0 END) AS correct,
         COALESCE(SUM(reward_earned), 0) AS total_earned
       FROM user_question_answers WHERE user_id = $1`,
      [userId],
    );

    // Today's quiz activity (PH day boundary)
    const todayRes = await pool.query(
      `SELECT COALESCE(SUM(reward_earned), 0) AS today_earned,
              COUNT(*) AS today_answered
       FROM user_question_answers
       WHERE user_id = $1 AND answered_at >= ${SQL_PH_DAY_START}`,
      [userId],
    );

    const lifetimeAnswered = parseInt(lifetimeRes.rows[0]?.total ?? '0');
    const lifetimeCorrect  = parseInt(lifetimeRes.rows[0]?.correct ?? '0');
    const totalEarned      = parseFloat(lifetimeRes.rows[0]?.total_earned ?? '0');
    const todayEarned      = parseFloat(todayRes.rows[0]?.today_earned ?? '0');
    const todayAnswered    = parseInt(todayRes.rows[0]?.today_answered ?? '0');

    // Determine the question cap that applies to this user.
    //  - Free:    lifetime cap (100 total) + active promo bonus (e.g. +500)
    //  - Premium: daily cap (1000/day, resets at PH midnight)
    //  - Elite:   no cap at all
    let questionLimit:  number | null;
    let questionsLeft:  number | null;
    if (effectivePlan === 'free') {
      const promoBonus = activePromo?.bonus_questions ?? 0;
      // Baseline lifetime only consumes the baseline cap; promo answers
      // consume the promo bonus separately (and expire with the promo).
      const baselineRemaining = Math.max(0, FREE_LIFETIME_QUESTIONS - lifetimeAnswered);
      let promoRemaining = 0;
      if (activePromo) {
        const promoUsedRes = await pool.query(
          `SELECT COUNT(*) AS c FROM user_question_answers WHERE user_id = $1 AND promo_id = $2`,
          [userId, activePromo.id],
        );
        const promoUsed = parseInt(promoUsedRes.rows[0]?.c ?? '0');
        promoRemaining = Math.max(0, promoBonus - promoUsed);
      }
      questionLimit = FREE_LIFETIME_QUESTIONS + promoBonus;
      questionsLeft = baselineRemaining + promoRemaining;
    } else if (dailyQuestionLimit !== null) {
      questionLimit = dailyQuestionLimit;
      questionsLeft = Math.max(0, dailyQuestionLimit - todayAnswered);
    } else {
      // Elite: unlimited
      questionLimit = null;
      questionsLeft = null;
    }

    const dailyRemaining = dailyEarnLimit !== null
      ? Math.max(0, dailyEarnLimit - todayEarned)
      : null;

    const hasQuestionsLeft = questionsLeft === null || questionsLeft > 0;
    const hasEarningsLeft  = dailyRemaining === null || dailyRemaining > 0;
    const canEarnMore      = hasQuestionsLeft && hasEarningsLeft;

    res.json({
      success:          true,
      plan:             effectivePlan,
      question_limit:   questionLimit,       // null for elite
      total_answered:   lifetimeAnswered,     // lifetime total (used by UI progress)
      total_correct:    lifetimeCorrect,
      questions_left:   questionsLeft,       // null for elite
      total_earned:     totalEarned,
      today_earned:     todayEarned,
      today_answered:   todayAnswered,
      daily_limit:      dailyEarnLimit,
      daily_remaining:  dailyRemaining,
      can_earn_more:    canEarnMore,
      // Reason flags the frontend uses to decide which UI to render.
      // Free users who've exhausted BOTH their baseline AND any active promo
      // quota are "done". Any active promo temporarily unblocks them.
      free_lifetime_exhausted: effectivePlan === 'free'
        && lifetimeAnswered >= FREE_LIFETIME_QUESTIONS
        && (questionsLeft ?? 0) <= 0,
      earnings_capped:         dailyRemaining !== null && dailyRemaining <= 0,
      // Active promo so the UI can show a countdown + bonus hint
      active_promo: activePromo ? {
        bonus_questions:    activePromo.bonus_questions,
        lift_free_earn_cap: activePromo.lift_free_earn_cap,
        ends_at:            activePromo.ends_at,
      } : null,
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
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.is_active = TRUE AND s.expires_at > NOW()
       WHERE u.id = $1 LIMIT 1`,
      [userId],
    );
    const effectivePlan  = (planRes.rows[0]?.effective_plan ?? 'free') as string;
    const dailyQuestionLimit = DAILY_QUESTION_LIMITS[effectivePlan] ?? null;
    let   dailyEarnLimit     = DAILY_EARN_LIMITS[effectivePlan] ?? null;

    // Active promotion for this plan
    const activePromo = await getActivePromo(effectivePlan);
    if (activePromo && activePromo.lift_free_earn_cap) dailyEarnLimit = null;

    // Free plan: enforce lifetime cap (baseline). Promo bonus (if any) adds
    // extra eligible answers that are tagged with promo_id and excluded
    // from the baseline count.
    if (effectivePlan === 'free') {
      const countRes = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE promo_id IS NULL) AS baseline,
           COUNT(*) FILTER (WHERE promo_id = $2)    AS promo_used
         FROM user_question_answers WHERE user_id = $1`,
        [userId, activePromo?.id ?? -1],
      );
      const baselineUsed = parseInt(countRes.rows[0]?.baseline ?? '0');
      const promoUsed    = parseInt(countRes.rows[0]?.promo_used ?? '0');
      const promoBonus   = activePromo?.bonus_questions ?? 0;
      const baselineLeft = Math.max(0, FREE_LIFETIME_QUESTIONS - baselineUsed);
      const promoLeft    = Math.max(0, promoBonus - promoUsed);

      if (baselineLeft <= 0 && promoLeft <= 0) {
        res.json({
          success: false,
          reason:  'free_lifetime_exhausted',
          message: `You've used all ${FREE_LIFETIME_QUESTIONS} questions on the free plan. Upgrade to Premium or Elite to keep earning from the quiz bot.`,
        });
        return;
      }
    } else if (dailyQuestionLimit !== null) {
      // Premium: enforce daily cap (reset at PH midnight)
      const dayRes = await pool.query(
        `SELECT COUNT(*) AS today FROM user_question_answers
         WHERE user_id = $1 AND answered_at >= ${SQL_PH_DAY_START}`,
        [userId],
      );
      const todayCount = parseInt(dayRes.rows[0]?.today ?? '0');
      if (todayCount >= dailyQuestionLimit) {
        res.json({
          success: false,
          reason:  'daily_limit_reached',
          message: `You've used your ${dailyQuestionLimit} questions for today. Your quota resets at 12:00 AM PST.`,
        });
        return;
      }
    }

    // Check quiz-bot earning cap (based on today's PH-day quiz earnings only)
    if (dailyEarnLimit !== null) {
      const earnRes = await pool.query(
        `SELECT COALESCE(SUM(reward_earned), 0) AS today_earned
         FROM user_question_answers
         WHERE user_id = $1 AND answered_at >= ${SQL_PH_DAY_START}`,
        [userId],
      );
      const todayEarned = parseFloat(earnRes.rows[0]?.today_earned ?? '0');
      if (todayEarned >= dailyEarnLimit) {
        res.json({
          success: false,
          reason:  'earnings_capped',
          message: effectivePlan === 'free'
            ? `Come back tomorrow — you've reached your ₱${dailyEarnLimit} daily limit.`
            : `Come back tomorrow — you've reached your ₱${dailyEarnLimit} daily quiz limit.`,
        });
        return;
      }
    }

    // Get next eligible question.
    // Always serve the least-recently-answered question across all plans.
    // This guarantees the bank never appears exhausted — when all questions
    // have been answered today the one answered longest ago is served again,
    // providing the best possible variety even on a small question bank.
    const leastRecentSql = `SELECT q.id, q.question, q.answer, q.category
       FROM chat_questions q
       LEFT JOIN (
         SELECT question_id, MAX(answered_at) AS last_answered
         FROM user_question_answers WHERE user_id = $1
         GROUP BY question_id
       ) ua ON ua.question_id = q.id
       ORDER BY COALESCE(ua.last_answered, '1970-01-01'::timestamptz) ASC, RANDOM()
       LIMIT 1`;

    const questionRes = await pool.query(leastRecentSql, [userId]);

    if (questionRes.rowCount === 0) {
      res.json({
        success: false,
        reason:  'no_questions',
        message: 'No more questions available.',
      });
      return;
    }

    const q             = questionRes.rows[0] as { id: number; question: string; answer: string; category: string };
    const correctAnswer = q.answer;

    // Pick 1 distractor from a different question (different answer text, prefer same category)
    const distractorRes = await pool.query(
      `(SELECT answer FROM chat_questions
        WHERE id != $1 AND LOWER(answer) != LOWER($2) AND category = $3
        ORDER BY RANDOM() LIMIT 1)
       UNION ALL
       (SELECT answer FROM chat_questions
        WHERE id != $1 AND LOWER(answer) != LOWER($2)
        ORDER BY RANDOM() LIMIT 1)
       LIMIT 1`,
      [q.id, correctAnswer, q.category],
    );
    const distractor = (distractorRes.rows[0]?.answer as string | undefined) ?? 'None of the above';

    // Shuffle so the correct answer isn't always in the same position
    const choices = Math.random() > 0.5
      ? [correctAnswer, distractor]
      : [distractor, correctAnswer];

    res.json({
      success:  true,
      question: {
        id:       q.id,
        question: q.question,
        category: q.category,
        choices,
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

    // Get effective plan. All plans may be served a recycled question when
    // the fresh-question bank is exhausted but the user's plan quota isn't,
    // so we don't reject "already answered recently" here — the real caps
    // below (lifetime for Free, daily count for Premium, earnings cap for
    // all) enforce the limits.
    const submitPlanRes = await pool.query(
      `SELECT CASE WHEN s.id IS NOT NULL THEN s.plan ELSE u.plan END AS effective_plan
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id AND s.is_active = TRUE AND s.expires_at > NOW()
       WHERE u.id = $1 LIMIT 1`,
      [userId],
    );
    const submitEffectivePlan = (submitPlanRes.rows[0]?.effective_plan ?? 'free') as string;

    const effectivePlan      = submitEffectivePlan;
    const dailyQuestionLimit = DAILY_QUESTION_LIMITS[effectivePlan] ?? null;
    let   dailyEarnLimit     = DAILY_EARN_LIMITS[effectivePlan] ?? null;

    // Active promotion — tags this answer, grants bonus quota, may lift cap
    const activePromo = await getActivePromo(effectivePlan);
    if (activePromo && activePromo.lift_free_earn_cap) dailyEarnLimit = null;

    // Enforce the right cap based on plan
    if (effectivePlan === 'free') {
      const countRes = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE promo_id IS NULL) AS baseline,
           COUNT(*) FILTER (WHERE promo_id = $2)    AS promo_used
         FROM user_question_answers WHERE user_id = $1`,
        [userId, activePromo?.id ?? -1],
      );
      const baselineUsed = parseInt(countRes.rows[0]?.baseline ?? '0');
      const promoUsed    = parseInt(countRes.rows[0]?.promo_used ?? '0');
      const promoBonus   = activePromo?.bonus_questions ?? 0;
      const baselineLeft = Math.max(0, FREE_LIFETIME_QUESTIONS - baselineUsed);
      const promoLeft    = Math.max(0, promoBonus - promoUsed);
      if (baselineLeft <= 0 && promoLeft <= 0) {
        res.status(403).json({ success: false, error: 'Free plan lifetime question limit reached.' });
        return;
      }
    } else if (dailyQuestionLimit !== null) {
      const dayRes = await pool.query(
        `SELECT COUNT(*) AS today FROM user_question_answers
         WHERE user_id = $1 AND answered_at >= ${SQL_PH_DAY_START}`,
        [userId],
      );
      const todayCount = parseInt(dayRes.rows[0]?.today ?? '0');
      if (todayCount >= dailyQuestionLimit) {
        res.status(403).json({ success: false, error: 'Daily question limit reached.' });
        return;
      }
    }

    // Check correctness (case-insensitive, trimmed)
    const correctAnswer = questionRes.rows[0].answer as string;
    const userAnswer    = String(answer).trim();
    const isCorrect     = userAnswer.toLowerCase() === correctAnswer.toLowerCase();

    let rewardEarned = 0;

    if (isCorrect) {
      // Check daily earning limit before awarding (PH day boundary, quiz earnings only)
      if (dailyEarnLimit !== null) {
        const earnRes = await pool.query(
          `SELECT COALESCE(SUM(reward_earned), 0) AS today_earned
           FROM user_question_answers
           WHERE user_id = $1 AND answered_at >= ${SQL_PH_DAY_START}`,
          [userId],
        );
        const todayEarned = parseFloat(earnRes.rows[0]?.today_earned ?? '0');
        if (todayEarned < dailyEarnLimit) {
          rewardEarned = Math.min(REWARD_PER_CORRECT, dailyEarnLimit - todayEarned);
        }
      } else {
        rewardEarned = REWARD_PER_CORRECT;
      }
    }

    // Decide whether this answer consumes baseline or promo quota so it can
    // be tagged accordingly. For Free users we prefer baseline until it's
    // exhausted, then fall through to promo. Non-Free plans never tag.
    let promoIdForThisAnswer: number | null = null;
    if (activePromo && effectivePlan === 'free') {
      const quotaRes = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE promo_id IS NULL) AS baseline FROM user_question_answers WHERE user_id = $1`,
        [userId],
      );
      const baselineUsed = parseInt(quotaRes.rows[0]?.baseline ?? '0');
      if (baselineUsed >= FREE_LIFETIME_QUESTIONS) {
        promoIdForThisAnswer = activePromo.id;
      }
    }

    // Save answer in transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO user_question_answers (user_id, question_id, user_answer, is_correct, reward_earned, promo_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, question_id, userAnswer, isCorrect, rewardEarned, promoIdForThisAnswer],
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
