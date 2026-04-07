import crypto from 'crypto';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  cookieOptions,
} from '../utils/tokenUtil.ts';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
  NotFoundError,
} from '../utils/errors.ts';
import type { JwtPayload } from '../types/express.js';
import { sendVerificationEmail } from '../services/email.ts';

const BCRYPT_ROUNDS = 12;

function makeReferralCode(): string {
  return uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function deviceFingerprint(req: Request): string {
  const ua   = req.headers['user-agent']      ?? '';
  const lang = req.headers['accept-language'] ?? '';
  const enc  = req.headers['accept-encoding'] ?? '';
  return Buffer.from(`${req.ip}|${ua}|${lang}|${enc}`).toString('base64').slice(0, 64);
}

export function issueTokenCookies(res: Response, payload: Partial<JwtPayload>): void {
  const accessToken  = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ id: payload.id! });
  res.cookie('access_token',  accessToken,  cookieOptions.access);
  res.cookie('refresh_token', refreshToken, cookieOptions.refresh);
}

// ─── register ──────────────────────────────────────────────────────────────

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, email, password, referral_code: refCode } = req.body as Record<string, string>;

    const exists = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1',
      [email.toLowerCase(), username.toLowerCase()]
    );
    if (exists.rowCount && exists.rowCount > 0) throw new ConflictError('Email or username is already taken');

    let referredById: string | null = null;
    if (refCode) {
      const ref = await pool.query('SELECT id FROM users WHERE referral_code = $1 LIMIT 1', [refCode.toUpperCase()]);
      if (ref.rowCount && ref.rowCount > 0) referredById = ref.rows[0].id as string;
    }

    const passwordHash    = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newReferralCode = makeReferralCode();
    const fingerprint     = deviceFingerprint(req);

    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, referral_code, referred_by, device_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, plan, balance, referral_code, is_admin`,
      [username.toLowerCase(), email.toLowerCase(), passwordHash, newReferralCode, referredById, fingerprint]
    );

    const user = rows[0] as Record<string, unknown>;

    // ── Referral bonus: credit referrer for each new sign-up ──────────────
    if (referredById) {
      try {
        // Find the first active referral task to get the reward amount
        const refTaskRes = await pool.query(
          `SELECT id, reward_amount FROM tasks
           WHERE type = 'referral' AND is_active = TRUE
           ORDER BY reward_amount DESC LIMIT 1`,
        );
        if (refTaskRes.rowCount && refTaskRes.rowCount > 0) {
          const refTask = refTaskRes.rows[0] as { id: string; reward_amount: string };
          // Credit referrer balance + record a task completion for them
          await pool.query('BEGIN');
          try {
            await pool.query(
              `UPDATE users SET balance = balance + $1 WHERE id = $2`,
              [refTask.reward_amount, referredById],
            );
            await pool.query(
              `INSERT INTO task_completions
                 (user_id, task_id, status, reward_earned, completed_at,
                  proof, server_data)
               VALUES ($1, $2, 'approved', $3, NOW(), '{}', '{}')`,
              [referredById, refTask.id, refTask.reward_amount],
            );
            await pool.query('COMMIT');
          } catch {
            await pool.query('ROLLBACK');
            // Non-fatal — registration still succeeds
          }
        }
      } catch {
        // Non-fatal — do not block registration if bonus logic fails
      }
    }

    // ── Send email verification ───────────────────────────────────────────
    try {
      const rawToken  = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [user.id as string, tokenHash],
      );
      // Fire and forget — email must never delay the registration response
      sendVerificationEmail(user.email as string, user.username as string, rawToken).catch(() => {});
    } catch {
      // Non-fatal — account is created; user can resend from dashboard
    }

    issueTokenCookies(res, { id: user.id as string, username: user.username as string, is_admin: user.is_admin as boolean });
    res.status(201).json({ success: true, user });
  } catch (err) { next(err); }
}

// ─── login ─────────────────────────────────────────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as Record<string, string>;

    const { rows } = await pool.query(
      `SELECT id, username, email, password_hash, totp_secret, plan,
              balance, referral_code, is_admin, is_banned, is_verified
       FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()]
    );

    if (rows.length === 0) throw new AuthenticationError('Invalid credentials');

    const user = rows[0] as Record<string, unknown>;
    if (user.is_banned) throw new AuthenticationError('This account has been suspended');

    const passwordMatch = await bcrypt.compare(password, user.password_hash as string);
    if (!passwordMatch) throw new AuthenticationError('Invalid credentials');

    if (user.totp_secret) {
      const preToken = generateAccessToken({ id: user.id as string, pending_2fa: true });
      res.cookie('pre_auth_token', preToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   5 * 60 * 1000,
      });
      res.json({ success: true, requires_2fa: true });
      return;
    }

    issueTokenCookies(res, { id: user.id as string, username: user.username as string, is_admin: user.is_admin as boolean });
    const { password_hash, totp_secret, ...safeUser } = user;
    void password_hash; void totp_secret;
    res.json({ success: true, user: safeUser });
  } catch (err) { next(err); }
}

// ─── verify2FA login ───────────────────────────────────────────────────────

export async function verify2FALogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token }  = req.body as Record<string, string>;
    const preToken   = req.cookies?.pre_auth_token as string | undefined;

    if (!preToken) throw new AuthenticationError('No pending 2FA session');

    let decoded: JwtPayload;
    try {
      decoded = verifyAccessToken(preToken);
    } catch {
      decoded = verifyRefreshToken(preToken) as JwtPayload;
    }

    if (!decoded.pending_2fa) throw new AuthenticationError('Invalid 2FA session');

    const { rows } = await pool.query(
      'SELECT id, username, totp_secret, is_admin, is_banned FROM users WHERE id = $1',
      [decoded.id]
    );
    if (rows.length === 0) throw new AuthenticationError('User not found');

    const user = rows[0] as Record<string, unknown>;
    if (user.is_banned) throw new AuthenticationError('Account suspended');

    const valid = speakeasy.totp.verify({
      secret:   user.totp_secret as string,
      encoding: 'base32',
      token,
      window:   1,
    });

    if (!valid) throw new AuthenticationError('Invalid 2FA code');

    res.clearCookie('pre_auth_token');
    issueTokenCookies(res, { id: user.id as string, username: user.username as string, is_admin: user.is_admin as boolean });
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ─── logout ────────────────────────────────────────────────────────────────

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('access_token',  { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
  res.json({ success: true });
}

// ─── refresh ───────────────────────────────────────────────────────────────

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.refresh_token as string | undefined;
    if (!token) throw new AuthenticationError('No refresh token');

    const decoded = verifyRefreshToken(token);

    const { rows } = await pool.query(
      'SELECT id, username, is_admin, is_banned FROM users WHERE id = $1',
      [decoded.id]
    );
    if (rows.length === 0 || (rows[0] as Record<string, unknown>).is_banned) {
      throw new AuthenticationError('User not found or suspended');
    }

    const user = rows[0] as Record<string, unknown>;
    const accessToken = generateAccessToken({
      id:       user.id as string,
      username: user.username as string,
      is_admin: user.is_admin as boolean,
    });
    res.cookie('access_token', accessToken, cookieOptions.access);
    res.json({ success: true });
  } catch (err) { next(err); }
}

// ─── 2FA setup ─────────────────────────────────────────────────────────────

export async function setup2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    const { rows } = await pool.query('SELECT username, totp_secret FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) throw new NotFoundError('User not found');

    const user = rows[0] as Record<string, unknown>;
    if (user.totp_secret) throw new ConflictError('2FA is already enabled');

    const secret = speakeasy.generateSecret({ name: `Plivio (${user.username as string})`, length: 20 });

    await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret.base32, userId]);

    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url!);
    res.json({ success: true, qr: qrDataUrl, secret: secret.base32 });
  } catch (err) { next(err); }
}

// ─── 2FA enable ────────────────────────────────────────────────────────────

export async function enable2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body as Record<string, string>;
    const userId    = req.user!.id;

    const { rows } = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) throw new NotFoundError('User not found');

    const { totp_secret } = rows[0] as { totp_secret: string | null };
    if (!totp_secret) throw new ValidationError('Run /auth/2fa/setup first');

    const valid = speakeasy.totp.verify({ secret: totp_secret, encoding: 'base32', token, window: 1 });
    if (!valid) throw new ValidationError('Invalid verification code');

    res.json({ success: true, message: '2FA successfully enabled' });
  } catch (err) { next(err); }
}

// ─── 2FA disable ───────────────────────────────────────────────────────────

export async function disable2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body as Record<string, string>;
    const userId    = req.user!.id;

    const { rows } = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) throw new NotFoundError('User not found');

    const { totp_secret } = rows[0] as { totp_secret: string | null };
    if (!totp_secret) throw new ValidationError('2FA is not enabled');

    const valid = speakeasy.totp.verify({ secret: totp_secret, encoding: 'base32', token, window: 1 });
    if (!valid) throw new AuthenticationError('Invalid 2FA code');

    await pool.query('UPDATE users SET totp_secret = NULL WHERE id = $1', [userId]);
    res.json({ success: true, message: '2FA disabled' });
  } catch (err) { next(err); }
}
