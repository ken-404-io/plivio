// Promotions scheduler.
//
// Detects transitions into and out of active promotion windows and fires
// one-shot side effects at each transition:
//   - START:  broadcast announcement email + in-app notification to every
//             eligible active user, then stamp `launched_at`.
//   - END:    stamp `ended_at`. No destructive work is required because
//             promo answers are tagged with promo_id and baseline quotas
//             are computed by excluding tagged rows.
//
// State lives in the `promotions` table (migration 024), so the scheduler
// is restart-safe: a restart mid-window simply re-enters the active state
// and the `launched_at`/`ended_at` stamps prevent double-firing.

import pool from '../config/db.ts';
import { logger } from '../utils/logger.ts';
import { broadcastEmailToAll } from '../services/email.ts';
import { createNotification } from '../utils/notify.ts';

interface PromotionRow {
  id:                 number;
  key:                string;
  description:        string | null;
  starts_at:          string;
  ends_at:            string;
  bonus_questions:    number;
  lift_free_earn_cap: boolean;
  applies_to_plan:    string;
  launched_at:        string | null;
  ended_at:           string | null;
}

async function launchPromotion(promo: PromotionRow): Promise<void> {
  const endsAt = new Date(promo.ends_at);
  const endLabel = endsAt.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday:  'long', month: 'long', day: 'numeric',
    hour:     'numeric', minute: '2-digit',
  });

  // Stamp launched_at immediately so a concurrent tick can't re-trigger.
  // Only proceed if we won the race.
  const stamp = await pool.query<{ id: number }>(
    `UPDATE promotions SET launched_at = NOW()
     WHERE id = $1 AND launched_at IS NULL
     RETURNING id`,
    [promo.id],
  );
  if (stamp.rowCount === 0) return;

  logger.info({ promo_id: promo.id, key: promo.key }, 'Launching promotion');

  // Eligible recipients: active, non-banned, email-verified users on the
  // promo's target plan. Subscription overrides DB plan (matches the
  // effective-plan logic used elsewhere in the codebase).
  const { rows: recipients } = await pool.query<{
    id: string; email: string; username: string;
  }>(
    `SELECT u.id, u.email, u.username
     FROM users u
     LEFT JOIN subscriptions s
       ON s.user_id = u.id AND s.is_active = TRUE AND s.expires_at > NOW()
     WHERE COALESCE(s.plan, u.plan) = $1
       AND u.is_banned = FALSE
       AND u.is_email_verified = TRUE
       AND (u.is_suspended = FALSE OR u.suspended_until <= NOW())`,
    [promo.applies_to_plan],
  );

  logger.info({ count: recipients.length, promo_id: promo.id }, 'Promotion recipients resolved');

  // In-app notifications — create one per user. Fire-and-forget per row so
  // a single failure doesn't abort the broadcast.
  const titleIn = `🎁 ${promo.bonus_questions} free bonus questions unlocked!`;
  const bodyIn  = `You've just received ${promo.bonus_questions} bonus Quizly questions on the house. Earn uncapped for the next 24 hours — bonus expires ${endLabel} PHT.`;
  for (const r of recipients) {
    void createNotification(r.id, 'admin_message', titleIn, bodyIn, '/quizly');
  }

  // Email broadcast — runs sequentially with rate limiting inside
  // broadcastEmailToAll. Don't await the whole thing blocking the tick;
  // let it run in the background.
  const subject = `You've got ${promo.bonus_questions} free Quizly questions — 24 hours only`;
  const message = [
    `Great news — your ${promo.bonus_questions} bonus questions are LIVE in Quizly right now.`,
    ``,
    `For the next 24 hours (until ${endLabel} PHT) you can:`,
    `  • Answer up to ${promo.bonus_questions} extra questions on top of your normal allowance.`,
    `  • Earn with NO daily cap — every correct answer pays, no ceiling.`,
    ``,
    `Once the window closes, your account returns to normal — this is a time-limited surprise, so make it count.`,
    ``,
    `Tap below to open Quizly and get started.`,
  ].join('\n');

  void broadcastEmailToAll(
    recipients.map((r: { id: string; email: string; username: string }) => ({ email: r.email, username: r.username })),
    subject,
    message,
  ).catch((err: Error) => {
    logger.error({ err: err.message, promo_id: promo.id }, 'Promotion email broadcast failed');
  });
}

async function endPromotion(promo: PromotionRow): Promise<void> {
  const stamp = await pool.query<{ id: number }>(
    `UPDATE promotions SET ended_at = NOW()
     WHERE id = $1 AND ended_at IS NULL
     RETURNING id`,
    [promo.id],
  );
  if (stamp.rowCount === 0) return;
  // No destructive rollback needed: promo-tagged answers remain in-place,
  // but the controllers exclude them from baseline counts and no longer
  // grant the bonus quota once ends_at is in the past.
  logger.info({ promo_id: promo.id, key: promo.key }, 'Promotion ended');
}

export async function runPromotionsTick(): Promise<void> {
  try {
    // Find promos that need to be launched (started but not yet announced).
    const { rows: toLaunch } = await pool.query<PromotionRow>(
      `SELECT * FROM promotions
       WHERE starts_at <= NOW()
         AND ends_at   >  NOW()
         AND launched_at IS NULL
       ORDER BY starts_at ASC`,
    );
    for (const p of toLaunch) await launchPromotion(p);

    // Find promos that have ended but haven't been stamped yet.
    const { rows: toEnd } = await pool.query<PromotionRow>(
      `SELECT * FROM promotions
       WHERE ends_at <= NOW()
         AND ended_at IS NULL
       ORDER BY ends_at ASC`,
    );
    for (const p of toEnd) await endPromotion(p);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Promotions tick failed');
  }
}
