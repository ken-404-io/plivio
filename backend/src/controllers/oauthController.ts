/**
 * OAuth 2.0 social login – Google, Facebook, GitHub.
 *
 * Flow per provider:
 *  1. GET /api/auth/{provider}           → redirect to provider's consent page
 *  2. GET /api/auth/{provider}/callback  → exchange code → get user info
 *                                          → upsert user → set JWT cookies
 *                                          → redirect to frontend /dashboard
 *
 * Security:
 *  – state parameter (random 16-byte hex, stored in a short-lived httpOnly
 *    cookie) prevents CSRF on the OAuth callback.
 *  – Tokens from providers are never stored; only the provider's user ID is.
 *  – OAuth accounts are auto-verified (provider already verified the email).
 *  – All HTTPS calls use Node's built-in `https` module (no extra deps).
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 *   BACKEND_URL   – public backend base URL, e.g. http://localhost:3000
 *   APP_URL       – frontend base URL, e.g. http://localhost:5173
 */
import crypto  from 'crypto';
import https   from 'https';
import http    from 'http';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response } from 'express';
import pool from '../config/db.ts';
import { issueTokenCookies } from './authController.ts';
import { logger } from '../utils/logger.ts';

type Provider = 'google' | 'facebook' | 'github';

const BACKEND_URL = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const APP_URL     = process.env.APP_URL     ?? 'http://localhost:5173';

// ─── HTTPS fetch helper ────────────────────────────────────────────────────

function fetchJson(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const parsed    = new URL(urlStr);
    const isHttps   = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const reqOptions = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method ?? 'GET',
      headers:  options.headers ?? {},
    };

    if (options.body) {
      (reqOptions.headers as Record<string, string>)['Content-Length'] =
        String(Buffer.byteLength(options.body));
    }

    const req = transport.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data) as Record<string, unknown>); }
        catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)); }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── State cookie helpers ──────────────────────────────────────────────────

function setStateCookie(res: Response, provider: Provider): string {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',   // 'lax' required – callback is a GET redirect from provider
    maxAge:   10 * 60 * 1000, // 10 minutes
  });
  return state;
}

function validateState(req: Request, res: Response, provider: Provider, state: string): boolean {
  const cookie = req.cookies?.[`oauth_state_${provider}`] as string | undefined;
  res.clearCookie(`oauth_state_${provider}`);
  if (!cookie || !state) return false;
  // Constant-time comparison
  if (cookie.length !== state.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(state));
}

// ─── Username generator for new OAuth accounts ────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);
}

async function uniqueUsername(base: string): Promise<string> {
  const slug = slugify(base) || 'user';
  const { rows } = await pool.query(
    'SELECT username FROM users WHERE username LIKE $1 ORDER BY username',
    [`${slug}%`],
  );
  if (rows.length === 0) return slug;
  // Append a short numeric suffix until unique
  for (let i = 2; i < 9999; i++) {
    const candidate = `${slug}${i}`;
    if (!(rows as { username: string }[]).find((r) => r.username === candidate)) return candidate;
  }
  return `${slug}${crypto.randomInt(10_000, 99_999)}`;
}

function makeReferralCode(): string {
  return uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
}

// ─── Upsert OAuth user ─────────────────────────────────────────────────────

interface OAuthProfile {
  providerUserId: string;
  email:          string | null;
  name:           string;
  avatarUrl:      string | null;
  isVerified:     boolean;
}

async function upsertOAuthUser(
  provider: Provider,
  profile: OAuthProfile,
): Promise<{ id: string; username: string; is_admin: boolean }> {
  const idCol = `${provider}_id`;

  // 1. Look up by provider ID (fastest path)
  const byProvider = await pool.query(
    `SELECT id, username, is_admin, is_banned FROM users WHERE ${idCol} = $1 LIMIT 1`,
    [profile.providerUserId],
  );
  if (byProvider.rowCount && byProvider.rowCount > 0) {
    const u = byProvider.rows[0] as Record<string, unknown>;
    if (u.is_banned) throw new Error('This account has been suspended');
    return { id: u.id as string, username: u.username as string, is_admin: u.is_admin as boolean };
  }

  // 2. Email match → link provider to existing account
  if (profile.email) {
    const byEmail = await pool.query(
      `SELECT id, username, is_admin, is_banned FROM users WHERE email = $1 LIMIT 1`,
      [profile.email.toLowerCase()],
    );
    if (byEmail.rowCount && byEmail.rowCount > 0) {
      const u = byEmail.rows[0] as Record<string, unknown>;
      if (u.is_banned) throw new Error('This account has been suspended');
      // Link this provider to the existing account
      await pool.query(
        `UPDATE users SET ${idCol} = $1, avatar_url = COALESCE(avatar_url, $2) WHERE id = $3`,
        [profile.providerUserId, profile.avatarUrl, u.id],
      );
      return { id: u.id as string, username: u.username as string, is_admin: u.is_admin as boolean };
    }
  }

  // 3. New user — create account
  const username     = await uniqueUsername(profile.name);
  const referralCode = makeReferralCode();
  const email        = profile.email?.toLowerCase() ?? `${provider}_${profile.providerUserId}@oauth.local`;

  const { rows } = await pool.query(
    `INSERT INTO users
       (username, email, ${idCol}, avatar_url, referral_code, is_email_verified)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username, is_admin`,
    [username, email, profile.providerUserId, profile.avatarUrl, referralCode, profile.isVerified],
  );

  return rows[0] as { id: string; username: string; is_admin: boolean };
}

// ─── GOOGLE ────────────────────────────────────────────────────────────────

export function googleRedirect(req: Request, res: Response): void {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) { res.status(503).json({ error: 'Google OAuth not configured' }); return; }

  const state       = setStateCookie(res, 'google');
  const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;
  const params      = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    access_type:   'online',
    prompt:        'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;
  const redirectUri = `${BACKEND_URL}/api/auth/google/callback`;

  if (error || !validateState(req, res, 'google', state)) {
    res.redirect(`${APP_URL}/login?error=oauth_failed`); return;
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetchJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }).toString(),
    });

    const accessToken = tokenRes.access_token as string;

    // Fetch user info
    const info = await fetchJson('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const user = await upsertOAuthUser('google', {
      providerUserId: info.id as string,
      email:          info.email as string | null,
      name:           (info.name as string) || (info.given_name as string) || 'User',
      avatarUrl:      info.picture as string | null,
      isVerified:     Boolean(info.verified_email),
    });

    issueTokenCookies(res, user);
    res.redirect(`${APP_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'Google OAuth callback error');
    res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
}

// ─── FACEBOOK ─────────────────────────────────────────────────────────────

export function facebookRedirect(req: Request, res: Response): void {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) { res.status(503).json({ error: 'Facebook OAuth not configured' }); return; }

  const state       = setStateCookie(res, 'facebook');
  const redirectUri = `${BACKEND_URL}/api/auth/facebook/callback`;
  const params      = new URLSearchParams({
    client_id:     appId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'email,public_profile',
    state,
  });
  res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`);
}

export async function facebookCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;
  const redirectUri = `${BACKEND_URL}/api/auth/facebook/callback`;

  if (error || !validateState(req, res, 'facebook', state)) {
    res.redirect(`${APP_URL}/login?error=oauth_failed`); return;
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetchJson(
      `https://graph.facebook.com/v18.0/oauth/access_token?${new URLSearchParams({
        client_id:     process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        redirect_uri:  redirectUri,
        code,
      }).toString()}`,
    );

    const accessToken = tokenRes.access_token as string;

    // Fetch user info
    const info = await fetchJson(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`,
    );

    const picture = info.picture as Record<string, unknown> | undefined;
    const picData = picture?.data as Record<string, unknown> | undefined;

    const user = await upsertOAuthUser('facebook', {
      providerUserId: info.id as string,
      email:          info.email as string | null ?? null,
      name:           (info.name as string) || 'User',
      avatarUrl:      picData?.url as string | null ?? null,
      isVerified:     false, // Facebook doesn't provide verified status
    });

    issueTokenCookies(res, user);
    res.redirect(`${APP_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'Facebook OAuth callback error');
    res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
}

// ─── GITHUB ───────────────────────────────────────────────────────────────

export function githubRedirect(req: Request, res: Response): void {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) { res.status(503).json({ error: 'GitHub OAuth not configured' }); return; }

  const state       = setStateCookie(res, 'github');
  const redirectUri = `${BACKEND_URL}/api/auth/github/callback`;
  const params      = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: redirectUri,
    scope:        'user:email read:user',
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

export async function githubCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !validateState(req, res, 'github', state)) {
    res.redirect(`${APP_URL}/login?error=oauth_failed`); return;
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetchJson('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify({
        client_id:     process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${BACKEND_URL}/api/auth/github/callback`,
      }),
    });

    const accessToken = tokenRes.access_token as string;
    const authHeader  = { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Plivio-App' };

    // Fetch profile and emails in parallel
    const [profile, emails] = await Promise.all([
      fetchJson('https://api.github.com/user', { headers: authHeader }),
      fetchJson('https://api.github.com/user/emails', { headers: authHeader }),
    ]);

    // Find primary verified email
    type GHEmail = { email: string; primary: boolean; verified: boolean };
    const emailList   = Array.isArray(emails) ? (emails as GHEmail[]) : [];
    const primaryMail = emailList.find((e) => e.primary && e.verified)?.email
                     ?? emailList.find((e) => e.verified)?.email
                     ?? null;

    const user = await upsertOAuthUser('github', {
      providerUserId: String(profile.id),
      email:          primaryMail ?? (profile.email as string | null),
      name:           (profile.name as string) || (profile.login as string) || 'User',
      avatarUrl:      profile.avatar_url as string | null,
      isVerified:     Boolean(primaryMail), // verified if we got a verified email
    });

    issueTokenCookies(res, user);
    res.redirect(`${APP_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'GitHub OAuth callback error');
    res.redirect(`${APP_URL}/login?error=oauth_failed`);
  }
}
