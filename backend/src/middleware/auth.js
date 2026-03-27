import { verifyAccessToken } from '../utils/tokenUtil.js';
import { AuthenticationError } from '../utils/errors.js';

/**
 * Extracts and verifies the JWT access token from the HttpOnly cookie.
 * Attaches the decoded payload to req.user.
 */
export function authenticate(req, _res, next) {
  const token = req.cookies?.access_token;
  if (!token) return next(new AuthenticationError('No access token provided'));

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requires the authenticated user to have the admin flag set.
 * Must be used after authenticate().
 */
export function requireAdmin(req, _res, next) {
  if (!req.user?.is_admin) {
    return next(new AuthenticationError('Admin privileges required'));
  }
  next();
}
