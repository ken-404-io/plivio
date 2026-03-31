import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ValidationError } from '../utils/errors.ts';

/** GET /notifications — latest 30, newest first */
export async function listNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user!.id],
    );

    const unread = (rows as { is_read: boolean }[]).filter((n) => !n.is_read).length;

    res.json({ success: true, notifications: rows, unread });
  } catch (err) { next(err); }
}

/** GET /notifications/unread-count — lightweight poll endpoint */
export async function unreadCount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [req.user!.id],
    );
    res.json({ success: true, count: Number((rows[0] as { count: string }).count) });
  } catch (err) { next(err); }
}

/** PUT /notifications/:id/read — mark one as read */
export async function markRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    // Validate UUID format to prevent injection
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('Invalid notification id');

    await pool.query(
      `UPDATE notifications SET is_read = TRUE
       WHERE id = $1 AND user_id = $2`,
      [id, req.user!.id],
    );

    res.json({ success: true });
  } catch (err) { next(err); }
}

/** PUT /notifications/read-all — mark all as read */
export async function markAllRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [req.user!.id],
    );
    res.json({ success: true });
  } catch (err) { next(err); }
}
