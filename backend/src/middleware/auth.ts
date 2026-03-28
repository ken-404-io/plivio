import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/tokenUtil.ts';
import { AuthenticationError } from '../utils/errors.ts';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token as string | undefined;
  if (!token) { next(new AuthenticationError('No access token provided')); return; }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.is_admin) {
    next(new AuthenticationError('Admin privileges required'));
    return;
  }
  next();
}
