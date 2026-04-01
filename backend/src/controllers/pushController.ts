import type { Request, Response, NextFunction } from 'express';
import webpush from 'web-push';
import pool from '../config/db.ts';
import { ValidationError } from '../utils/errors.ts';

// ─── VAPID setup ─────────────────────────────────────────────────────────────
// Generate once with: npx web-push generate-vapid-keys
// Then set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your .env

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_EMAIL   = process.env.VAPID_EMAIL       ?? 'mailto:support@plivio.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

// ─── GET /api/push/key ────────────────────────────────────────────────────────
// Returns the public VAPID key for the frontend to use when subscribing
export async function getPublicKey(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, public_key: VAPID_PUBLIC });
}

// ─── POST /api/push/subscribe ─────────────────────────────────────────────────
// Body: { endpoint, keys: { p256dh, auth } }
export async function subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { endpoint, keys } = req.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new ValidationError('Invalid push subscription payload.');
    }

    // Upsert so re-subscribing the same endpoint just updates keys
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint)
       DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [userId, endpoint, keys.p256dh, keys.auth],
    );

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/push/subscribe ───────────────────────────────────────────────
// Body: { endpoint }
export async function unsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { endpoint } = req.body as { endpoint: string };

    if (!endpoint) {
      throw new ValidationError('endpoint is required.');
    }

    await pool.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [userId, endpoint],
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ─── Internal helper: send push to a user ─────────────────────────────────────
// Called from other controllers (e.g. withdrawal approved, task reward)
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url = '/',
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return; // push not configured

  const { rows } = await pool.query<{ endpoint: string; p256dh: string; auth: string }>(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId],
  );

  const payload = JSON.stringify({ title, body, url });

  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err: unknown) {
      // If subscription is expired/invalid, clean it up
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await pool.query(
          'DELETE FROM push_subscriptions WHERE endpoint = $1',
          [sub.endpoint],
        ).catch(() => undefined);
      }
    }
  }
}
