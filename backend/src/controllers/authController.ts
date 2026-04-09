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

// ─── Disposable / throwaway email domains ─────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamailblock.com', 'grr.la',
  'sharklasers.com', 'guerrillamailblock.com', 'spam4.me', 'trashmail.com',
  'trashmail.me', 'trashmail.at', 'trashmail.io', 'trashmail.net', 'trashmail.org',
  'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf', 'nospam.ze.tc',
  'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf',
  'monemail.fr.nf', 'monmail.fr.nf', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'fakeinbox.com', 'mailnull.com', 'spamgourmet.com', 'spamgourmet.net',
  'dispostable.com', 'maildrop.cc', 'throwam.com', 'throwaway.email',
  'emailondeck.com', 'mohmal.com', 'getairmail.com', 'filzmail.com',
  'getnada.com', 'nada.email', 'nada.ltd', 'mytemp.email', 'tempinbox.com',
  'tempail.com', 'inboxbear.com', 'discard.email', 'spamhereplease.com',
  'tempinbox.co.uk', 'mailnesia.com', 'throwam.com', 'binkmail.com',
  'spamavert.com', 'bspamfree.org', 'mailseal.de', 'oneoffmail.com',
  'tempr.email', 'trbvm.com', 'spamfree24.org', 'spamfree.eu',
]);

/**
 * Normalise a Gmail address to its canonical form so that
 * dots-in-username variants and +alias tricks all map to the same identity.
 * e.g. j.o.h.n+spam@gmail.com → john@gmail.com
 */
function normaliseEmail(raw: string): string {
  const lower = raw.toLowerCase().trim();
  const [localRaw, domain] = lower.split('@');
  if (!domain) return lower;

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const local = (localRaw.split('+')[0] ?? localRaw).replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  return lower;
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
    const { username, email, password, referral_code: refCode, device_id: deviceId } = req.body as Record<string, string>;

    // ── Block disposable email domains ────────────────────────────────────
    const emailDomain = email.toLowerCase().trim().split('@')[1] ?? '';
    if (DISPOSABLE_DOMAINS.has(emailDomain)) {
      throw new ValidationError('Disposable email addresses are not allowed. Please use a real email.');
    }

    // ── Normalise email (collapse Gmail dots/plus tricks) ─────────────────
    const normalisedEmail = normaliseEmail(email);

    const exists = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR email = $2 OR username = $3 LIMIT 1',
      [email.toLowerCase(), normalisedEmail, username.toLowerCase()]
    );
    if (exists.rowCount && exists.rowCount > 0) throw new ConflictError('Email or username is already taken');

    // ── Device-ID uniqueness (1 registration per device) ─────────────────
    const deviceKey = deviceId?.trim().slice(0, 128) || null;
    if (deviceKey) {
      const devRes = await pool.query(
        'SELECT id FROM users WHERE device_fingerprint = $1 LIMIT 1',
        [deviceKey],
      );
      if (devRes.rowCount && devRes.rowCount > 0) {
        throw new ConflictError('An account has already been registered from this device.');
      }
    }

    let referredById: string | null = null;
    if (refCode) {
      const ref = await pool.query('SELECT id FROM users WHERE referral_code = $1 LIMIT 1', [refCode.toUpperCase()]);
      if (ref.rowCount && ref.rowCount > 0) referredById = ref.rows[0].id as string;
    }

    const passwordHash    = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newReferralCode = makeReferralCode();
    // Prefer the client-supplied device UUID; fall back to server-side headers fingerprint
    const fingerprint     = deviceKey ?? deviceFingerprint(req);

    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, referral_code, referred_by, device_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, plan, balance, referral_code, is_admin`,
      [username.toLowerCase(), normalisedEmail, passwordHash, newReferralCode, referredById, fingerprint]
    );

    const user = rows[0] as Record<string, unknown>;

    // ── Referral bonus: credit referrer for each new sign-up ──────────────
    if (referredById) {
      try {
        // Pick the referral task for a free-plan signup (lowest reward tier).
        // New users always start on free, so use min_plan = 'free' or unset.
        // ORDER BY reward_amount ASC ensures we don't accidentally pick the
        // premium upgrade bonus (₱25) when the new user is still on free (₱10).
        const refTaskRes = await pool.query(
          `SELECT id, reward_amount FROM tasks
           WHERE type = 'referral' AND is_active = TRUE
             AND (min_plan IS NULL OR min_plan = 'free')
           ORDER BY reward_amount ASC LIMIT 1`,
        );
        if (refTaskRes.rowCount && refTaskRes.rowCount > 0) {
          const refTask = refTaskRes.rows[0] as { id: string; reward_amount: string };
          await pool.query('BEGIN');
          try {
            await pool.query(
              `UPDATE users SET balance = balance + $1 WHERE id = $2`,
              [refTask.reward_amount, referredById],
            );
            await pool.query(
              `INSERT INTO task_completions
                 (user_id, task_id, type, status, reward_earned, completed_at,
                  proof, server_data)
               VALUES ($1, $2, 'referral', 'approved', $3, NOW(), '{}', '{}')`,
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
