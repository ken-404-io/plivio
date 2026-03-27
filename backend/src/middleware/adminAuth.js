import { ForbiddenError } from '../utils/errors.js';

const WHITELIST = new Set(
  (process.env.ADMIN_WHITELIST_IPS || '127.0.0.1,::1,::ffff:127.0.0.1')
    .split(',')
    .map((ip) => ip.trim())
);

/**
 * Allows access only from IPs listed in ADMIN_WHITELIST_IPS.
 * Place this before authenticate() on admin routes so unknown IPs get
 * a 403 without leaking whether a route exists.
 */
export function adminIpWhitelist(req, _res, next) {
  const clientIp = req.ip || req.socket?.remoteAddress;

  if (!WHITELIST.has(clientIp)) {
    return next(new ForbiddenError('Admin panel is not accessible from your network'));
  }

  next();
}
