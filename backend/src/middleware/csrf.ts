import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const CSRF_COOKIE  = 'csrf_token';
const CSRF_HEADER  = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const CSRF_EXEMPT = new Set([
  '/api/auth/verify-email',
  '/api/auth/verify-email/resend',
  '/api/auth/reset-password',
  '/api/users/me/confirm-email-change',
  '/api/subscriptions/webhook',
]);

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  const isProd = process.env.NODE_ENV === 'production';

  let token = req.cookies[CSRF_COOKIE] as string | undefined;
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure:   isProd,
      sameSite: 'lax',
      domain:   isProd ? '.studioplivio.com' : undefined,
      maxAge:   CSRF_MAX_AGE_MS,
    });
  }

  req.csrfToken = token;
  res.setHeader('X-CSRF-Token', token);

  if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT.has(req.path)) {
    next();
    return;
  }

  const headerToken = req.headers[CSRF_HEADER] as string | undefined;
  if (!headerToken || headerToken !== token) {
    res.status(403).json({ success: false, error: 'Invalid CSRF token.' });
    return;
  }

  next();
}
