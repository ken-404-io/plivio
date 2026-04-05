/**
 * Thin helper for creating in-app notifications.
 * All failures are swallowed — notification creation must never break
 * the calling request's transaction or response.
 */
import pool from '../config/db.ts';
import { logger } from './logger.ts';

export type NotificationType =
  | 'task_approved'
  | 'withdrawal_paid'
  | 'withdrawal_rejected'
  | 'referral_bonus'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'email_verified'
  | 'admin_message';

export async function createNotification(
  userId:  string,
  type:    NotificationType,
  title:   string,
  message: string,
  link?:   string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, link ?? null],
    );
  } catch (err) {
    logger.error({ err, userId, type }, '[notify] failed to create notification');
  }
}
