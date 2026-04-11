import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const CSRF_COOKIE  = 'csrf_token';
const CSRF_HEADER  = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CSRF_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isProd = process.env.NODE_ENV === 'production';

  let token = req.cookies[CSRF_COOKIE] as string | undefined;
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure:   isProd,
      sameSite: isProd ? 'none' : 'strict',
      domain:   isProd ? '.studioplivio.com' : undefined,
      maxAge:   CSRF_MAX_AGE_MS,
    });
  }

  req.csrfToken = token;

  // Always expose the token in a response header so the frontend can read it
  res.setHeader('X-CSRF-Token', token);

  if (SAFE_METHODS.has(req.method)) { next(); return; }

  // Exempt PayMongo webhook — server-to-server call, no CSRF token
  if (req.path === '/api/subscriptions/webhook') { next(); return; }

  // Exempt email-token flows. The link comes from an email the user just
  // received, so the very first request from a fresh browser tab does not
  // yet have the CSRF cookie/token pair established. The token in the body
  // is itself a single-use, cryptographically-random secret (64-char hex,
  // SHA-256 hashed in DB), which already provides CSRF protection — an
  // attacker can't forge a request without knowing the token.
  if (
    req.path === '/api/auth/verify-email' ||
    req.path === '/api/auth/reset-password' ||
    req.path === '/api/users/me/confirm-email-change'
  ) { next(); return; }

  const headerToken = req.headers[CSRF_HEADER] as string | undefined;
  if (!headerToken || headerToken !== token) {
    res.status(403).json({ success: false, error: 'Invalid CSRF token.' });
    return;
  }

  next();
}
