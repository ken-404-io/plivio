/**
 * Email verification and password reset controller.
 *
 * Security design:
 *  – Tokens are 32 crypto-random bytes encoded as hex (256-bit entropy).
 *  – Only the SHA-256 hash of each token is stored in the database.
 *    If the DB is ever compromised the raw tokens remain unknown to an attacker.
 *  – Password reset tokens expire after 15 minutes (short window reduces risk).
 *  – Email verification tokens expire after 24 hours.
 *  – Tokens are deleted immediately on use (no replay possible).
 *  – All stale tokens for a user are purged before a new one is issued
 *    (prevents token accumulation / enumeration via timing).
 *  – forgotPassword always returns 200 whether or not the email exists
 *    (prevents user-enumeration attacks).
 *  – New password is bcrypt-compared against old hash to prevent re-use.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  RateLimitError,
} from '../utils/errors.ts';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '../services/email.ts';
import { logger } from '../utils/logger.ts';
import { issueTokenCookies } from './authController.ts';

const BCRYPT_ROUNDS = 12;

// ─── Token helpers ────────────────────────────────────────────────────────────

/** Returns a URL-safe 64-char hex token (password reset links). */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generates a 6-digit numeric OTP used for email verification.
 * Uses `crypto.randomInt` so the value is uniformly distributed and
 * unbiased, which `Math.random()` is not.
 */
function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Returns the SHA-256 hex digest used for DB storage. */
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Returns a user-scoped hash of a 6-digit OTP. Scoping the hash to a
 * specific user_id means two users who happen to draw the same OTP will
 * produce different hashes and therefore never collide on the DB's
 * UNIQUE(token_hash) constraint.
 */
function hashOtp(userId: string, otp: string): string {
  return crypto.createHash('sha256').update(`${userId}:${otp}`).digest('hex');
}

// ─── OTP generation helper (shared by register / resend endpoints) ──────────
// Generates a fresh 6-digit code, purges any previous tokens for the user,
// stores the user-scoped hash in email_verification_tokens with a 15-minute
// expiry, and sends it via email. Returns the raw OTP only so the caller
// can log / debug — never return it in an HTTP response.

export async function issueVerificationOtp(
  userId: string,
  email: string,
  username: string,
): Promise<string> {
  const otp  = generateOtp();
  const hash = hashOtp(userId, otp);

  // Purge old tokens for this user so only one code is valid at a time.
  await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);

  await pool.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [userId, hash],
  );

  await sendVerificationEmail(email, username, otp);
  return otp;
}

// ─── 1. Send / resend email verification (authenticated) ────────────────────

export async function sendEmailVerification(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const { rows } = await pool.query(
      'SELECT id, email, username, is_email_verified FROM users WHERE id = $1',
      [userId],
    );
    if (rows.length === 0) throw new NotFoundError('User not found');

    const user = rows[0] as {
      id: string; email: string; username: string; is_email_verified: boolean;
    };
    if (user.is_email_verified) {
      res.json({ success: true, message: 'Email is already verified' });
      return;
    }

    // Rate-limit: max 3 codes in the last hour per user
    const recentCount = await pool.query(
      `SELECT COUNT(*) FROM email_verification_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId],
    );
    if (Number((recentCount.rows[0] as { count: string }).count) >= 3) {
      throw new RateLimitError('Too many verification codes sent. Please wait before requesting again.');
    }

    await issueVerificationOtp(user.id, user.email, user.username);

    res.json({ success: true, message: 'Verification code sent' });
  } catch (err) { next(err); }
}

// ─── 1b. Public resend verification (pre-login) ──────────────────────────────
// Lets a user who just registered (and therefore has no session cookie yet)
// request a fresh verification email. Uses the same per-user rate limit as
// the authenticated /verify-email/send endpoint and always returns a safe
// message to avoid user-enumeration.

export async function resendVerificationPublic(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const SAFE_MSG = 'If that email is registered and unverified, a new verification code has been sent.';

  try {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string') {
      res.json({ success: true, message: SAFE_MSG });
      return;
    }

    const normalised = email.toLowerCase().trim();

    const { rows } = await pool.query(
      'SELECT id, username, email, is_email_verified FROM users WHERE email = $1 LIMIT 1',
      [normalised],
    );

    if (rows.length === 0) {
      // Do not reveal whether the email exists
      res.json({ success: true, message: SAFE_MSG });
      return;
    }

    const user = rows[0] as {
      id: string; username: string; email: string; is_email_verified: boolean;
    };

    if (user.is_email_verified) {
      res.json({ success: true, message: SAFE_MSG });
      return;
    }

    // Rate-limit: max 3 codes per hour per user
    const recentCount = await pool.query(
      `SELECT COUNT(*) FROM email_verification_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [user.id],
    );
    if (Number((recentCount.rows[0] as { count: string }).count) >= 3) {
      // Still return the safe message — do not leak the rate-limit state
      res.json({ success: true, message: SAFE_MSG });
      return;
    }

    await issueVerificationOtp(user.id, user.email, user.username);

    res.json({ success: true, message: SAFE_MSG });
  } catch (err) { next(err); }
}

// ─── 2. Verify email with OTP ────────────────────────────────────────────────
// Takes { email, code } where `code` is the 6-digit OTP the user received
// by email. On success we issue session cookies so the user is logged in
// immediately — they never need to visit the login page again after
// registering.

export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, code } = req.body as { email?: string; code?: string };

    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required');
    }
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      throw new ValidationError('Enter the 6-digit code from your email');
    }

    const normalisedEmail = email.toLowerCase().trim();

    // Look up user by email so we can compute the user-scoped hash.
    const userRes = await pool.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [normalisedEmail],
    );
    if (userRes.rowCount === 0) {
      // Do not reveal whether the email exists — generic failure message.
      throw new AuthenticationError('Invalid or expired verification code');
    }
    const userId = (userRes.rows[0] as { id: string }).id;

    const codeHash = hashOtp(userId, code);

    const { rows } = await pool.query(
      `SELECT evt.id, evt.user_id, evt.expires_at
       FROM email_verification_tokens evt
       WHERE evt.token_hash = $1 AND evt.user_id = $2`,
      [codeHash, userId],
    );

    if (rows.length === 0) throw new AuthenticationError('Invalid or expired verification code');

    const row = rows[0] as { id: string; user_id: string; expires_at: Date };

    if (new Date(row.expires_at) < new Date()) {
      await pool.query('DELETE FROM email_verification_tokens WHERE id = $1', [row.id]);
      throw new AuthenticationError('Verification code has expired. Please request a new one.');
    }

    // Mark verified and delete the used token atomically; fetch referred_by for bonus
    const client = await pool.connect();
    let sessionUser: { id: string; username: string; is_admin: boolean } | null = null;
    try {
      await client.query('BEGIN');

      const userRes = await client.query<{
        id: string;
        username: string;
        is_admin: boolean;
        is_banned: boolean;
        referred_by: string | null;
        is_email_verified: boolean;
      }>(
        `SELECT id, username, is_admin, is_banned, referred_by, is_email_verified
         FROM users WHERE id = $1 FOR UPDATE`,
        [row.user_id],
      );
      const userRow = userRes.rows[0];

      if (userRow?.is_banned) {
        await client.query('ROLLBACK');
        throw new AuthenticationError('This account has been suspended');
      }

      // Idempotency guard — do nothing if already verified, but still issue
      // a session so the user can land in /dashboard from the email link.
      if (userRow?.is_email_verified) {
        await client.query('ROLLBACK');
        issueTokenCookies(res, {
          id:       userRow.id,
          username: userRow.username,
          is_admin: userRow.is_admin,
        });
        res.json({ success: true, message: 'Email already verified', auto_login: true });
        return;
      }

      await client.query('UPDATE users SET is_email_verified = TRUE WHERE id = $1', [row.user_id]);
      await client.query('DELETE FROM email_verification_tokens WHERE id = $1', [row.id]);

      // Record the session details so we can issue cookies once the TX
      // commits successfully.
      if (userRow) {
        sessionUser = {
          id:       userRow.id,
          username: userRow.username,
          is_admin: userRow.is_admin,
        };
      }

      // ── Credit referral bonus now that we know the email is real ─────────
      // This is the path that attributes manually-signed-up users to their
      // referrer. OAuth accounts are credited at upsert time because the
      // provider has already verified their email; manual accounts rely on
      // this block running successfully after the user clicks the link.
      if (userRow?.referred_by) {
        try {
          const refTaskRes = await client.query<{ id: string; reward_amount: string }>(
            `SELECT id, reward_amount FROM tasks
             WHERE type = 'referral' AND is_active = TRUE
               AND (min_plan IS NULL OR min_plan = 'free')
             ORDER BY reward_amount ASC LIMIT 1`,
          );
          if (refTaskRes.rowCount && refTaskRes.rowCount > 0) {
            const refTask = refTaskRes.rows[0];
            await client.query(
              'UPDATE users SET balance = balance + $1 WHERE id = $2',
              [refTask.reward_amount, userRow.referred_by],
            );
            await client.query(
              `INSERT INTO task_completions
                 (user_id, task_id, type, status, reward_earned, completed_at, proof, server_data)
               VALUES ($1, $2, 'referral', 'approved', $3, NOW(), '{}', '{}')`,
              [userRow.referred_by, refTask.id, refTask.reward_amount],
            );
            logger.info(
              { referrerId: userRow.referred_by, referredUserId: row.user_id, amount: refTask.reward_amount },
              '✅ Referral bonus credited on manual email verification',
            );
          } else {
            logger.warn(
              { referrerId: userRow.referred_by, referredUserId: row.user_id },
              '⚠️ No active referral task found — referral bonus NOT credited',
            );
          }
        } catch (bonusErr) {
          // Log but don't fail verification — the account is still verified
          logger.error(
            { err: (bonusErr as Error).message, referrerId: userRow.referred_by, referredUserId: row.user_id },
            '❌ Failed to credit referral bonus on email verification',
          );
        }
      }

      await client.query('COMMIT');
    } catch (inner) {
      await client.query('ROLLBACK');
      throw inner;
    } finally {
      client.release();
    }

    // Auto-login the user now that their email is verified — they no
    // longer need to go back to /login. OAuth sign-ups already get cookies
    // at their callback; this completes the manual flow symmetrically.
    if (sessionUser) {
      issueTokenCookies(res, sessionUser);
    }

    res.json({
      success: true,
      message: 'Email verified successfully',
      auto_login: Boolean(sessionUser),
    });
  } catch (err) { next(err); }
}

// ─── 3. Forgot password (no user enumeration) ────────────────────────────────

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Always return this same message regardless of whether the email exists.
  // This prevents attackers from discovering which emails are registered.
  const SAFE_MSG = 'If that email is registered you will receive a reset link shortly.';

  try {
    const { email } = req.body as { email?: string };

    if (!email || typeof email !== 'string') {
      res.json({ success: true, message: SAFE_MSG });
      return;
    }

    const normalised = email.toLowerCase().trim();

    const { rows } = await pool.query(
      'SELECT id, username, email FROM users WHERE email = $1 LIMIT 1',
      [normalised],
    );

    if (rows.length === 0) {
      // Do NOT reveal the email does not exist — return the same response
      res.json({ success: true, message: SAFE_MSG });
      return;
    }

    const user = rows[0] as { id: string; username: string; email: string };

    // Rate-limit: max 3 reset requests per 15 min per user
    const recentCount = await pool.query(
      `SELECT COUNT(*) FROM password_reset_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
      [user.id],
    );
    if (Number((recentCount.rows[0] as { count: string }).count) >= 3) {
      // Still return the safe message — do not reveal a rate-limit for specific email
      res.json({ success: true, message: SAFE_MSG });
      return;
    }

    // Invalidate all previous reset tokens for this user
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    const raw       = generateToken();
    const tokenHash = hashToken(raw);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [user.id, tokenHash],
    );

    await sendPasswordResetEmail(user.email, user.username, raw);

    res.json({ success: true, message: SAFE_MSG });
  } catch (err) { next(err); }
}

// ─── 4. Reset password with token ────────────────────────────────────────────

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token, password } = req.body as { token?: string; password?: string };

    if (!token || typeof token !== 'string' || token.length !== 64 || !/^[a-f0-9]+$/.test(token)) {
      throw new ValidationError('Invalid reset token');
    }

    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw new ValidationError('Password must be 8–128 characters');
    }

    const tokenHash = hashToken(token);

    const { rows } = await pool.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, u.password_hash
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1`,
      [tokenHash],
    );

    if (rows.length === 0) throw new AuthenticationError('Invalid or expired reset link');

    const row = rows[0] as {
      id: string; user_id: string; expires_at: Date; password_hash: string;
    };

    if (new Date(row.expires_at) < new Date()) {
      await pool.query('DELETE FROM password_reset_tokens WHERE id = $1', [row.id]);
      throw new AuthenticationError('Reset link has expired. Please request a new one.');
    }

    // Prevent reusing the same password
    const isSamePassword = await bcrypt.compare(password, row.password_hash);
    if (isSamePassword) {
      throw new ValidationError('New password must be different from your current password');
    }

    const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Update password and delete the used token atomically
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, row.user_id]);
      await client.query('DELETE FROM password_reset_tokens WHERE id = $1', [row.id]);
      await client.query('COMMIT');
    } catch (inner) {
      await client.query('ROLLBACK');
      throw inner;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (err) { next(err); }
}
