import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.ts';

const WHITELIST = new Set(
  (process.env.ADMIN_WHITELIST_IPS || '127.0.0.1,::1,::ffff:127.0.0.1')
    .split(',')
    .map((ip) => ip.trim())
);

export function adminIpWhitelist(req: Request, _res: Response, next: NextFunction): void {
  const clientIp = req.ip ?? req.socket?.remoteAddress;

  if (!clientIp || !WHITELIST.has(clientIp)) {
    next(new ForbiddenError('Admin panel is not accessible from your network'));
    return;
  }

  next();
}
