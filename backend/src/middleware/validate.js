import { ValidationError } from '../utils/errors.js';

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/;

/**
 * Returns an Express middleware that validates req.body against a field schema.
 *
 * Schema example:
 *   { email: { required: true, type: 'email' }, age: { type: 'int', min: 18 } }
 */
export function validateBody(schema) {
  return (req, _res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const raw   = req.body?.[field];
      const value = raw !== undefined && raw !== null ? String(raw).trim() : raw;
      const empty = value === undefined || value === null || value === '';

      if (rules.required && empty) {
        errors.push(`${field} is required`);
        continue;
      }

      if (empty) continue;

      if (rules.type === 'email' && !EMAIL_RE.test(value)) {
        errors.push(`${field} must be a valid email address`);
      }

      if (rules.type === 'username' && !USERNAME_RE.test(value)) {
        errors.push(`${field} must be 3-50 characters (letters, numbers, underscores only)`);
      }

      if (rules.type === 'int' && !Number.isInteger(Number(value))) {
        errors.push(`${field} must be an integer`);
      }

      if (rules.type === 'number' && isNaN(Number(value))) {
        errors.push(`${field} must be a number`);
      }

      if (rules.minLength !== undefined && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }

      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }

      if (rules.min !== undefined && Number(value) < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }

      if (rules.max !== undefined && Number(value) > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      if (rules.pattern instanceof RegExp && !rules.pattern.test(value)) {
        errors.push(`${field} format is invalid`);
      }
    }

    if (errors.length > 0) {
      return next(new ValidationError(errors.join('; ')));
    }

    next();
  };
}
