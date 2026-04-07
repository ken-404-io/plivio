import crypto  from 'crypto';
import bcrypt  from 'bcrypt';
import fs      from 'fs';
import path    from 'path';
import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { AuthenticationError, NotFoundError, ValidationError, ConflictError, RateLimitError } from '../utils/errors.ts';
import { sendVerificationEmail } from '../services/email.ts';
import { AVATARS_DIR } from '../middleware/upload.ts';
import { logger } from '../utils/logger.ts';

const BCRYPT_ROUNDS = 12;

// ─── GET /users/me ────────────────────────────────────────────────────────

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, plan, balance, referral_code,
              is_verified, is_email_verified, is_admin, kyc_status,
              avatar_url, created_at,
              coins, streak_count, last_streak_date, streak_broken_at, streak_before_break,
              (totp_secret IS NOT NULL) AS has_2fa,
              (SELECT plan FROM subscriptions
               WHERE user_id = users.id AND is_active = TRUE AND expires_at > NOW()
               LIMIT 1) AS active_sub_plan,
              (SELECT expires_at FROM subscriptions
               WHERE user_id = users.id AND is_active = TRUE AND expires_at > NOW()
               LIMIT 1) AS sub_expires_at
       FROM users WHERE id = $1`,
      [req.user!.id],
    );
    if (rows.length === 0) throw new NotFoundError('User not found');
    res.json({ success: true, user: rows[0] });
  } catch (err) { next(err); }
}

// ─── PUT /users/me/password ───────────────────────────────────────────────

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { current_password, new_password } = req.body as Record<string, string>;

    if (!current_password || !new_password) {
      throw new ValidationError('Both current and new password are required');
    }
    if (new_password.length < 8 || new_password.length > 128) {
      throw new ValidationError('New password must be 8–128 characters');
    }

    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user!.id],
    );
    if (rows.length === 0) throw new NotFoundError('User not found');

    const { password_hash } = rows[0] as { password_hash: string | null };
    if (!password_hash) throw new ValidationError('Cannot change password for OAuth-only accounts');

    const matches = await bcrypt.compare(current_password, password_hash);
    if (!matches) throw new AuthenticationError('Current password is incorrect');

    const samePassword = await bcrypt.compare(new_password, password_hash);
    if (samePassword) throw new ValidationError('New password must differ from your current password');

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user!.id]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) { next(err); }
}

// ─── POST /users/me/avatar ────────────────────────────────────────────────

export async function uploadAvatar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const file = (req.file as Express.Multer.File | undefined);
    if (!file) throw new ValidationError('No file uploaded');

    const userId = req.user!.id;

    // Delete old avatar file if it exists
    const { rows: prev } = await pool.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [userId],
    );
    const oldUrl = (prev[0] as { avatar_url: string | null })?.avatar_url;
    if (oldUrl) {
      // oldUrl is like /uploads/avatars/abc.jpg → derive local path
      const filename    = path.basename(oldUrl);
      const oldFilePath = path.join(AVATARS_DIR, filename);
      const resolved    = path.resolve(oldFilePath);
      if (resolved.startsWith(path.resolve(AVATARS_DIR))) {
        try { fs.unlinkSync(resolved); } catch { /* may not exist */ }
      }
    }

    // Store relative URL (served via express.static)
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, userId]);

    res.json({ success: true, avatar_url: avatarUrl });
  } catch (err) { next(err); }
}

// ─── POST /users/me/change-email ──────────────────────────────────────────

export async function requestEmailChange(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { new_email } = req.body as { new_email?: string };

    if (!new_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email) || new_email.length > 254) {
      throw new ValidationError('Please provide a valid email address');
    }

    const normalised = new_email.toLowerCase().trim();
    const userId     = req.user!.id;

    // Prevent changing to same address
    const { rows: me } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if ((me[0] as { email: string }).email === normalised) {
      throw new ValidationError('That is already your current email address');
    }

    // Check not taken by another account
    const taken = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1',
      [normalised, userId],
    );
    if (taken.rowCount && taken.rowCount > 0) throw new ConflictError('Email already in use');

    // Rate limit: max 3 requests per hour per user
    const recent = await pool.query(
      `SELECT COUNT(*) FROM email_change_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId],
    );
    if (Number((recent.rows[0] as { count: string }).count) >= 3) {
      throw new RateLimitError('Too many email change requests. Wait before trying again.');
    }

    // Invalidate previous tokens for this user
    await pool.query('DELETE FROM email_change_tokens WHERE user_id = $1', [userId]);

    const raw       = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');

    await pool.query(
      `INSERT INTO email_change_tokens (user_id, new_email, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
      [userId, normalised, tokenHash],
    );

    // Reuse the verification email helper with a custom message
    await sendVerificationEmail(normalised, me[0] ? (me[0] as { email: string }).email : '', raw);
    // Note: the link goes to /verify-email-change?token=... on the frontend

    res.json({
      success: true,
      message: `A confirmation link has been sent to ${normalised}. It expires in 1 hour.`,
    });
  } catch (err) { next(err); }
}

// ─── POST /users/me/confirm-email-change ─────────────────────────────────

export async function confirmEmailChange(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token } = req.body as { token?: string };

    if (!token || token.length !== 64 || !/^[a-f0-9]+$/.test(token)) {
      throw new ValidationError('Invalid token');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { rows } = await pool.query(
      `SELECT ect.id, ect.user_id, ect.new_email, ect.expires_at
       FROM email_change_tokens ect
       WHERE ect.token_hash = $1`,
      [tokenHash],
    );

    if (rows.length === 0) throw new AuthenticationError('Invalid or expired link');

    const row = rows[0] as { id: string; user_id: string; new_email: string; expires_at: Date };
    if (new Date(row.expires_at) < new Date()) {
      await pool.query('DELETE FROM email_change_tokens WHERE id = $1', [row.id]);
      throw new AuthenticationError('Link has expired. Please request a new one.');
    }

    // Check email not taken (race condition guard)
    const taken = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1',
      [row.new_email, row.user_id],
    );
    if (taken.rowCount && taken.rowCount > 0) throw new ConflictError('Email is no longer available');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET email = $1, is_email_verified = TRUE WHERE id = $2',
        [row.new_email, row.user_id],
      );
      await client.query('DELETE FROM email_change_tokens WHERE id = $1', [row.id]);
      await client.query('COMMIT');
    } catch (inner) {
      await client.query('ROLLBACK');
      throw inner;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Email address updated successfully.' });
  } catch (err) { next(err); }
}

// ─── GET /users/me/earnings ───────────────────────────────────────────────

export async function getEarnings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const page   = Math.max(1, Number(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    // Optional filter params — validated against allowed values
    const ALLOWED_STATUSES = new Set(['pending', 'approved', 'rejected']);
    const ALLOWED_TYPES    = new Set(['captcha', 'video', 'ad_click', 'survey', 'referral']);
    const filterStatus = ALLOWED_STATUSES.has(req.query.status as string)
      ? (req.query.status as string) : null;
    const filterType   = ALLOWED_TYPES.has(req.query.type as string)
      ? (req.query.type as string) : null;

    // Fetch paginated list + summary stats in parallel
    const [listResult, countResult, summaryResult] = await Promise.all([
      pool.query(
        `SELECT tc.id, t.title, t.type, tc.reward_earned, tc.status, tc.completed_at
         FROM task_completions tc
         JOIN tasks t ON t.id = tc.task_id
         WHERE tc.user_id = $1
           AND ($2::text IS NULL OR tc.status = $2::completion_status)
           AND ($3::text IS NULL OR t.type    = $3::task_type)
         ORDER BY tc.completed_at DESC
         LIMIT $4 OFFSET $5`,
        [userId, filterStatus, filterType, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*) FROM task_completions tc
         JOIN tasks t ON t.id = tc.task_id
         WHERE tc.user_id = $1
           AND ($2::text IS NULL OR tc.status = $2::completion_status)
           AND ($3::text IS NULL OR t.type    = $3::task_type)`,
        [userId, filterStatus, filterType],
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(reward_earned), 0)                                          AS total_earned,
           COALESCE(SUM(reward_earned) FILTER (WHERE status = 'approved'), 0)       AS approved_amount,
           COALESCE(SUM(reward_earned) FILTER (WHERE status = 'pending'),  0)       AS pending_amount,
           COALESCE(SUM(reward_earned) FILTER (
             WHERE status = 'approved'
               AND completed_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')
           ), 0) AS today_earned,
           COUNT(*)                                                                  AS total_count,
           COUNT(*) FILTER (WHERE status = 'approved')                              AS approved_count,
           COUNT(*) FILTER (WHERE status = 'pending')                               AS pending_count
         FROM task_completions
         WHERE user_id = $1`,
        [userId],
      ),
    ]);

    type SummaryRow = {
      total_earned:    string;
      approved_amount: string;
      pending_amount:  string;
      today_earned:    string;
      total_count:     string;
      approved_count:  string;
      pending_count:   string;
    };
    const s = summaryResult.rows[0] as SummaryRow;

    res.json({
      success: true,
      data:    listResult.rows,
      meta: {
        page,
        limit,
        total: Number((countResult.rows[0] as { count: string }).count),
      },
      summary: {
        total_earned:    Number(s.total_earned),
        approved_amount: Number(s.approved_amount),
        pending_amount:  Number(s.pending_amount),
        today_earned:    Number(s.today_earned),
        total_count:     Number(s.total_count),
        approved_count:  Number(s.approved_count),
        pending_count:   Number(s.pending_count),
      },
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, userId: req.user?.id }, '❌ getEarnings SQL error');
    next(err);
  }
}

// ─── GET /users/me/referrals ──────────────────────────────────────────────

export async function getReferrals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    // Referred users list + total referral earnings in parallel
    const [listResult, earningsResult] = await Promise.all([
      pool.query(
        `SELECT u.username, u.plan, u.created_at
         FROM users u
         WHERE u.referred_by = $1
         ORDER BY u.created_at DESC`,
        [userId],
      ),
      pool.query(
        `SELECT COALESCE(SUM(reward_earned), 0) AS total
         FROM task_completions
         WHERE user_id = $1 AND type = 'referral' AND status = 'approved'`,
        [userId],
      ),
    ]);

    const totalEarned = Number((earningsResult.rows[0] as { total: string }).total);

    res.json({
      success:       true,
      referrals:     listResult.rows,
      total_earned:  totalEarned,
    });
  } catch (err) { next(err); }
}
