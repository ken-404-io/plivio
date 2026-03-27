import crypto from 'crypto';

const CSRF_COOKIE  = 'csrf_token';
const CSRF_HEADER  = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF protection.
 *
 * - Sets a random token in a non-HttpOnly cookie so the JS client can read it.
 * - For mutating requests (POST/PUT/PATCH/DELETE) the client must echo the
 *   same value back in the X-CSRF-Token request header.
 */
export function csrfMiddleware(req, res, next) {
  // Issue a new token if none exists yet
  if (!req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[CSRF_COOKIE];
  }

  if (SAFE_METHODS.has(req.method)) return next();

  const headerToken = req.headers[CSRF_HEADER];
  if (!headerToken || headerToken !== req.csrfToken) {
    return res.status(403).json({ success: false, error: 'Invalid CSRF token.' });
  }

  next();
}
