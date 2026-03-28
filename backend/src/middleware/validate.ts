import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors.ts';

type FieldType = 'email' | 'username' | 'int' | 'number' | 'string';

interface FieldRules {
  required?:  boolean;
  type?:      FieldType;
  minLength?: number;
  maxLength?: number;
  min?:       number;
  max?:       number;
  enum?:      string[];
  pattern?:   RegExp;
}

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/;

export function validateBody(schema: Record<string, FieldRules>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      const raw   = (req.body as Record<string, unknown>)?.[field];
      const value = raw !== undefined && raw !== null ? String(raw).trim() : raw as undefined;
      const empty = value === undefined || value === null || value === '';

      if (rules.required && empty) { errors.push(`${field} is required`); continue; }
      if (empty) continue;

      if (rules.type === 'email'    && !EMAIL_RE.test(value!))    errors.push(`${field} must be a valid email address`);
      if (rules.type === 'username' && !USERNAME_RE.test(value!)) errors.push(`${field} must be 3-50 characters (letters, numbers, underscores only)`);
      if (rules.type === 'int'      && !Number.isInteger(Number(value))) errors.push(`${field} must be an integer`);
      if (rules.type === 'number'   && isNaN(Number(value)))      errors.push(`${field} must be a number`);

      if (rules.minLength !== undefined && value!.length < rules.minLength) errors.push(`${field} must be at least ${rules.minLength} characters`);
      if (rules.maxLength !== undefined && value!.length > rules.maxLength) errors.push(`${field} must be at most ${rules.maxLength} characters`);
      if (rules.min       !== undefined && Number(value) < rules.min)       errors.push(`${field} must be at least ${rules.min}`);
      if (rules.max       !== undefined && Number(value) > rules.max)       errors.push(`${field} must be at most ${rules.max}`);
      if (rules.enum      && !rules.enum.includes(value!))                  errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      if (rules.pattern instanceof RegExp && !rules.pattern.test(value!))  errors.push(`${field} format is invalid`);
    }

    if (errors.length > 0) { next(new ValidationError(errors.join('; '))); return; }
    next();
  };
}
