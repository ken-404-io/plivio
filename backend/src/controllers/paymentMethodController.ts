import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.ts';

// ─── Validation constants ──────────────────────────────────────────────────────
const GCASH_PHONE_RE  = /^09\d{9}$/;
const PAYPAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_METHODS_PER_USER = 10;

// ─── Shared validation helpers ─────────────────────────────────────────────────

function normalizeMethod(raw: unknown): 'gcash' | 'paypal' {
  const method = String(raw ?? '').toLowerCase();
  if (method !== 'gcash' && method !== 'paypal') {
    throw new ValidationError('method must be gcash or paypal');
  }
  return method;
}

function validateAccountName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (!name || name.length < 2 || name.length > 100) {
    throw new ValidationError('account_name is required (2–100 characters)');
  }
  return name;
}

function validateAccountNumber(method: 'gcash' | 'paypal', raw: unknown): string {
  const account = String(raw ?? '').trim();
  if (method === 'gcash') {
    if (!GCASH_PHONE_RE.test(account)) {
      throw new ValidationError('GCash number must be in format 09XXXXXXXXX (11 digits)');
    }
    return account;
  }
  // paypal: normalize email to lowercase
  const normalized = account.toLowerCase();
  if (!PAYPAL_EMAIL_RE.test(normalized)) {
    throw new ValidationError('PayPal account must be a valid email address');
  }
  return normalized;
}

// Postgres unique-violation code
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && (err as { code?: string }).code === PG_UNIQUE_VIOLATION;
}

// ─── List the authenticated user's saved payment methods ──────────────────────

export async function listPaymentMethods(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, method, account_name, account_number, is_default,
              created_at, updated_at
       FROM payment_methods
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [req.user!.id],
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

// ─── Create a new payment method ──────────────────────────────────────────────

export async function createPaymentMethod(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const body   = req.body as Record<string, unknown>;

    const method         = normalizeMethod(body.method);
    const accountName    = validateAccountName(body.account_name);
    const accountNumber  = validateAccountNumber(method, body.account_number);
    const makeDefault    = Boolean(body.is_default);

    await client.query('BEGIN');

    // Enforce a per-user cap so we don't collect unbounded rows.
    const { rows: countRows } = await client.query(
      'SELECT COUNT(*) AS count FROM payment_methods WHERE user_id = $1',
      [userId],
    );
    const existing = Number((countRows[0] as { count: string }).count);
    if (existing >= MAX_METHODS_PER_USER) {
      throw new ValidationError(
        `You can save up to ${MAX_METHODS_PER_USER} payment methods. Remove one before adding another.`,
      );
    }

    // First method is automatically the default.
    const shouldBeDefault = existing === 0 ? true : makeDefault;

    if (shouldBeDefault) {
      await client.query(
        'UPDATE payment_methods SET is_default = FALSE WHERE user_id = $1 AND is_default = TRUE',
        [userId],
      );
    }

    const { rows } = await client.query(
      `INSERT INTO payment_methods (user_id, method, account_name, account_number, is_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, method, account_name, account_number, is_default, created_at, updated_at`,
      [userId, method, accountName, accountNumber, shouldBeDefault],
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) {
      next(new ConflictError(
        'This payment account is already linked to another user. Each GCash number or PayPal email can only be used by one Plivio account.',
      ));
      return;
    }
    next(err);
  } finally {
    client.release();
  }
}

// ─── Update a payment method (edit account name or set as default) ────────────

export async function updatePaymentMethod(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;
    const body   = req.body as Record<string, unknown>;

    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, userId],
    );
    if (!existingRows.length) throw new NotFoundError('Payment method not found');
    const existing = existingRows[0] as {
      id: string;
      method: 'gcash' | 'paypal';
      account_name: string;
      account_number: string;
      is_default: boolean;
    };

    // Only account_name and is_default are editable — swapping the account
    // number would defeat the uniqueness guarantee, so we force the user to
    // delete and re-create instead.
    const updates: string[] = [];
    const params: unknown[]  = [];
    let idx = 1;

    if (typeof body.account_name !== 'undefined') {
      const accountName = validateAccountName(body.account_name);
      updates.push(`account_name = $${idx++}`);
      params.push(accountName);
    }

    const makeDefault = typeof body.is_default !== 'undefined'
      ? Boolean(body.is_default)
      : existing.is_default;

    if (makeDefault && !existing.is_default) {
      await client.query(
        'UPDATE payment_methods SET is_default = FALSE WHERE user_id = $1 AND is_default = TRUE',
        [userId],
      );
      updates.push(`is_default = $${idx++}`);
      params.push(true);
    } else if (!makeDefault && existing.is_default) {
      // Can't unset the only default — if this is the user's sole method
      // we just keep it as default.
      const { rows: countRows } = await client.query(
        'SELECT COUNT(*) AS count FROM payment_methods WHERE user_id = $1',
        [userId],
      );
      const total = Number((countRows[0] as { count: string }).count);
      if (total > 1) {
        updates.push(`is_default = $${idx++}`);
        params.push(false);
      }
    }

    if (updates.length === 0) {
      await client.query('COMMIT');
      res.json({ success: true, data: existing });
      return;
    }

    updates.push(`updated_at = NOW()`);
    params.push(id, userId);

    const { rows } = await client.query(
      `UPDATE payment_methods SET ${updates.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx++}
       RETURNING id, method, account_name, account_number, is_default, created_at, updated_at`,
      params,
    );

    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

// ─── Delete a payment method ──────────────────────────────────────────────────

export async function deletePaymentMethod(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const userId = req.user!.id;
    const { id } = req.params as Record<string, string>;

    await client.query('BEGIN');

    const { rows } = await client.query(
      'DELETE FROM payment_methods WHERE id = $1 AND user_id = $2 RETURNING id, is_default',
      [id, userId],
    );
    if (!rows.length) throw new NotFoundError('Payment method not found');

    // If we just removed the default, promote the newest remaining method
    // so the user always has a default (when any exist).
    if ((rows[0] as { is_default: boolean }).is_default) {
      await client.query(
        `UPDATE payment_methods
         SET is_default = TRUE, updated_at = NOW()
         WHERE id = (
           SELECT id FROM payment_methods
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [userId],
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
