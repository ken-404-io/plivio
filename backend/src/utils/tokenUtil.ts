import jwt from 'jsonwebtoken';
import { AuthenticationError } from './errors.ts';
import type { JwtPayload } from '../types/express.js';
import type { CookieOptions } from 'express';

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET as string;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
const ACCESS_EXPIRY  = (process.env.JWT_ACCESS_EXPIRY  || '15m') as string;
const REFRESH_EXPIRY = (process.env.JWT_REFRESH_EXPIRY || '7d') as string;

export function generateAccessToken(payload: Partial<JwtPayload>): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY } as jwt.SignOptions);
}

export function generateRefreshToken(payload: { id: string }): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
  } catch {
    throw new AuthenticationError('Invalid or expired access token');
  }
}

export function verifyRefreshToken(token: string): JwtPayload & { id: string } {
  try {
    return jwt.verify(token, REFRESH_SECRET) as JwtPayload & { id: string };
  } catch {
    throw new AuthenticationError('Invalid or expired refresh token');
  }
}

export const cookieOptions: { access: CookieOptions; refresh: CookieOptions } = {
  access: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   15 * 60 * 1000,
  },
  refresh: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     '/api/auth/refresh',
  },
};
