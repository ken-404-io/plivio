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

const BCRYPT_ROUNDS = 12;

// ─── Token helpers ────────────────────────────────────────────────────────────

/** Returns a URL-safe 64-char hex token. */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Returns the SHA-256 hex digest used for DB storage. */
function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ─── 1. Send / resend email verification ─────────────────────────────────────

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

    // Rate-limit: max 3 tokens in the last hour per user
    const recentCount = await pool.query(
      `SELECT COUNT(*) FROM email_verification_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId],
    );
    if (Number((recentCount.rows[0] as { count: string }).count) >= 3) {
      throw new RateLimitError('Too many verification emails sent. Please wait before requesting again.');
    }

    // Delete any existing tokens for this user (only one valid at a time)
    await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);

    const raw       = generateToken();
    const tokenHash = hashToken(raw);

    await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [userId, tokenHash],
    );

    await sendVerificationEmail(user.email, user.username, raw);

    res.json({ success: true, message: 'Verification email sent' });
  } catch (err) { next(err); }
}

// ─── 2. Verify email with token ───────────────────────────────────────────────

export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token } = req.body as { token?: string };

    if (!token || typeof token !== 'string' || token.length !== 64 || !/^[a-f0-9]+$/.test(token)) {
      throw new ValidationError('Invalid verification token');
    }

    const tokenHash = hashToken(token);

    const { rows } = await pool.query(
      `SELECT evt.id, evt.user_id, evt.expires_at
       FROM email_verification_tokens evt
       WHERE evt.token_hash = $1`,
      [tokenHash],
    );

    if (rows.length === 0) throw new AuthenticationError('Invalid or expired verification link');

    const row = rows[0] as { id: string; user_id: string; expires_at: Date };

    if (new Date(row.expires_at) < new Date()) {
      await pool.query('DELETE FROM email_verification_tokens WHERE id = $1', [row.id]);
      throw new AuthenticationError('Verification link has expired. Please request a new one.');
    }

    // Mark verified and delete the used token atomically
    await pool.query('BEGIN');
    try {
      await pool.query('UPDATE users SET is_email_verified = TRUE WHERE id = $1', [row.user_id]);
      await pool.query('DELETE FROM email_verification_tokens WHERE id = $1', [row.id]);
      await pool.query('COMMIT');
    } catch (inner) {
      await pool.query('ROLLBACK');
      throw inner;
    }

    res.json({ success: true, message: 'Email verified successfully' });
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
