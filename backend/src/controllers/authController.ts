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
import { issueVerificationOtp } from './emailAuthController.ts';

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

/** Extract a human-readable device name from User-Agent string */
function parseDeviceName(ua: string): string {
  // Try to extract OS
  let os = 'Unknown OS';
  if (/Windows NT 10/i.test(ua))       os = 'Windows 10/11';
  else if (/Windows/i.test(ua))        os = 'Windows';
  else if (/Mac OS X/i.test(ua))       os = 'macOS';
  else if (/Android/i.test(ua))        os = 'Android';
  else if (/iPhone|iPad/i.test(ua))    os = 'iOS';
  else if (/Linux/i.test(ua))          os = 'Linux';
  else if (/CrOS/i.test(ua))          os = 'Chrome OS';

  // Try to extract browser
  let browser = 'Unknown Browser';
  if (/Edg\//i.test(ua))              browser = 'Edge';
  else if (/OPR\//i.test(ua))         browser = 'Opera';
  else if (/Chrome\//i.test(ua))      browser = 'Chrome';
  else if (/Firefox\//i.test(ua))     browser = 'Firefox';
  else if (/Safari\//i.test(ua))      browser = 'Safari';

  return `${browser} on ${os}`;
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
    // The client sends a hardware fingerprint (hw_...) derived from canvas,
    // screen, timezone, etc. — identical in normal and incognito modes.
    const deviceKey = deviceId?.trim().slice(0, 128) || null;
    const serverFp  = deviceFingerprint(req);
    const fpToCheck = deviceKey || serverFp;

    if (fpToCheck) {
      const devRes = await pool.query(
        'SELECT id FROM users WHERE device_fingerprint = $1 LIMIT 1',
        [fpToCheck],
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
    const devName         = parseDeviceName(req.headers['user-agent'] ?? '');

    let rows: Record<string, unknown>[];
    try {
      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash, referral_code, referred_by, device_fingerprint, device_name, device_registered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, username, email, plan, balance, referral_code, is_admin`,
        [username.toLowerCase(), normalisedEmail, passwordHash, newReferralCode, referredById, fingerprint, devName]
      );
      rows = result.rows as Record<string, unknown>[];
    } catch {
      // Fallback if device_name / device_registered_at columns don't exist yet
      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash, referral_code, referred_by, device_fingerprint)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, username, email, plan, balance, referral_code, is_admin`,
        [username.toLowerCase(), normalisedEmail, passwordHash, newReferralCode, referredById, fingerprint]
      );
      rows = result.rows as Record<string, unknown>[];
    }

    const user = rows[0] as Record<string, unknown>;

    // ── Referral bonus is deferred until email verification ───────────────
    // (crediting immediately allowed fake-email abuse; bonus now granted
    //  in emailAuthController.verifyEmail once the address is confirmed)

    // ── Send a 6-digit verification OTP ───────────────────────────────────
    // For manual sign-ups the account is NOT usable until the email is
    // verified — we do not issue session cookies here. The user will only
    // receive cookies after they submit the correct OTP to
    // /api/auth/verify-email (which itself issues cookies). OAuth sign-ups
    // still auto-login because the provider has already verified the email.
    // Fire-and-forget — email sending must never delay the register response.
    issueVerificationOtp(
      user.id as string,
      user.email as string,
      user.username as string,
    ).catch((err: unknown) => {
      // Non-fatal — account is created; user can tap "Resend code".
      // eslint-disable-next-line no-console
      console.error('[register] issueVerificationOtp failed', err);
    });

    res.status(201).json({
      success: true,
      requires_email_verification: true,
      message: 'Account created. Please check your email to verify your address before logging in.',
      email: user.email as string,
    });
  } catch (err) { next(err); }
}

// ─── login ─────────────────────────────────────────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, device_id: loginDeviceId } = req.body as Record<string, string>;

    const { rows } = await pool.query(
      `SELECT id, username, email, password_hash, totp_secret, plan,
              balance, referral_code, is_admin, is_banned, is_verified,
              is_email_verified, is_suspended, suspended_until, device_fingerprint
       FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()]
    );

    if (rows.length === 0) throw new AuthenticationError('Invalid credentials. Please check your email and password and try again.');

    const user = rows[0] as Record<string, unknown>;
    if (user.is_banned) throw new AuthenticationError('This account has been permanently banned');
    if (user.is_suspended && new Date(user.suspended_until as string) > new Date()) {
      const until = new Date(user.suspended_until as string).toLocaleDateString('en-PH', {
        month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      throw new AuthenticationError(`This account is suspended until ${until}`);
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash as string);
    if (!passwordMatch) throw new AuthenticationError('Invalid credentials. Please check your email and password and try again.');

    // Manual sign-ups must verify their email address before they can log in.
    // OAuth accounts never hit this endpoint (their provider has already
    // verified the address), so this check is manual-login-only by
    // construction. We return a structured error so the frontend can
    // render a friendly screen with a "Resend verification email" button.
    if (!user.is_email_verified) {
      res.status(403).json({
        success: false,
        error:   'Please verify your email address before logging in. Check your inbox for the verification link.',
        code:    'email_not_verified',
        email:   user.email as string,
      });
      return;
    }

    // ── Device binding enforcement (one user, one device) ────────────────
    // Admins are exempt from device binding so they can access from anywhere.
    const currentDeviceId = loginDeviceId?.trim().slice(0, 128) || null;
    const storedFingerprint = user.device_fingerprint as string | null;
    const isHardwareFp  = currentDeviceId?.startsWith('hw_');
    const storedIsLegacy = storedFingerprint && !storedFingerprint.startsWith('hw_');

    if (!user.is_admin && storedFingerprint && currentDeviceId) {
      if (storedIsLegacy && isHardwareFp) {
        // Legacy UUID → hardware fingerprint migration: rebind to hardware fp
        // so subsequent logins (including incognito) match correctly.
        const ua = req.headers['user-agent'] ?? '';
        const deviceName = parseDeviceName(ua);
        try {
          await pool.query(
            `UPDATE users SET device_fingerprint = $1, device_name = $2, device_registered_at = NOW() WHERE id = $3`,
            [currentDeviceId, deviceName, user.id],
          );
        } catch {
          await pool.query(
            `UPDATE users SET device_fingerprint = $1 WHERE id = $2`,
            [currentDeviceId, user.id],
          );
        }
      } else if (storedFingerprint !== currentDeviceId) {
        // Also check if this hardware fp is already taken by another account
        const { rows: fpCheck } = await pool.query(
          'SELECT id FROM users WHERE device_fingerprint = $1 AND id != $2 LIMIT 1',
          [currentDeviceId, user.id],
        );
        if (fpCheck.length > 0) {
          res.status(403).json({
            success: false,
            error:   'Access denied. This device is already linked to another account.',
            code:    'device_mismatch',
          });
          return;
        }
        res.status(403).json({
          success: false,
          error:   'Access denied. This account is already linked to another device. Please use your registered device to log in, or contact support to request a device change.',
          code:    'device_mismatch',
        });
        return;
      }
    }

    // If user has no device bound yet (e.g. pre-migration, device reset), bind the current device
    if (!user.is_admin && !storedFingerprint && currentDeviceId) {
      const ua = req.headers['user-agent'] ?? '';
      const deviceName = parseDeviceName(ua);
      try {
        await pool.query(
          `UPDATE users SET device_fingerprint = $1, device_name = $2, device_registered_at = NOW() WHERE id = $3`,
          [currentDeviceId, deviceName, user.id],
        );
      } catch {
        // Fallback if device_name / device_registered_at columns don't exist yet
        await pool.query(
          `UPDATE users SET device_fingerprint = $1 WHERE id = $2`,
          [currentDeviceId, user.id],
        );
      }
    }

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
    const { password_hash, totp_secret, device_fingerprint, ...safeUser } = user;
    void password_hash; void totp_secret; void device_fingerprint;
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
      'SELECT id, username, totp_secret, is_admin, is_banned, is_suspended, suspended_until FROM users WHERE id = $1',
      [decoded.id]
    );
    if (rows.length === 0) throw new AuthenticationError('User not found');

    const user = rows[0] as Record<string, unknown>;
    if (user.is_banned) throw new AuthenticationError('Account has been permanently banned');
    if (user.is_suspended && new Date(user.suspended_until as string) > new Date()) {
      throw new AuthenticationError('Account is currently suspended');
    }

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
      'SELECT id, username, is_admin, is_banned, is_suspended, suspended_until FROM users WHERE id = $1',
      [decoded.id]
    );
    const refreshedUser = rows[0] as Record<string, unknown> | undefined;
    if (!refreshedUser || refreshedUser.is_banned) {
      throw new AuthenticationError('User not found or banned');
    }
    if (refreshedUser.is_suspended && new Date(refreshedUser.suspended_until as string) > new Date()) {
      throw new AuthenticationError('Account is currently suspended');
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
