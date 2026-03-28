import type { Request } from 'express';

export interface JwtPayload {
  id:          string;
  username:    string;
  is_admin:    boolean;
  pending_2fa?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?:      JwtPayload;
      csrfToken?: string;
    }
  }
}

export {};
