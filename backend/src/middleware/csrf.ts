import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const CSRF_COOKIE  = 'csrf_token';
const CSRF_HEADER  = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[CSRF_COOKIE] as string;
  }

  if (SAFE_METHODS.has(req.method)) { next(); return; }

  const headerToken = req.headers[CSRF_HEADER] as string | undefined;
  if (!headerToken || headerToken !== req.csrfToken) {
    res.status(403).json({ success: false, error: 'Invalid CSRF token.' });
    return;
  }

  next();
}
