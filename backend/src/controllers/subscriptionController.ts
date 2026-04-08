/**
 * Subscription controller with PayMongo payment integration.
 *
 * Flow:
 *  1. POST /subscriptions/checkout  – creates a PayMongo payment link,
 *     stores a pending checkout row, returns { checkout_url }.
 *  2. User pays on PayMongo's hosted page.
 *  3. PayMongo fires a webhook → POST /subscriptions/webhook.
 *  4. Webhook verifies HMAC signature, marks checkout as paid, activates
 *     the subscription and sends a confirmation email.
 *
 * Environment variables needed:
 *   PAYMONGO_SECRET_KEY     – sk_test_… or sk_live_…
 *   PAYMONGO_WEBHOOK_SECRET – whsk_… (from PayMongo dashboard)
 */
import crypto from 'crypto';
import https  from 'https';
import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ValidationError } from '../utils/errors.ts';
import { sendSubscriptionConfirmEmail } from '../services/email.ts';

interface PlanInfo {
  name:        string;
  price_php:   number;
  daily_limit: number | null;
  features:    string[];
}

export const PLANS: Record<string, PlanInfo> = {
  free: {
    name:        'Free',
    price_php:   0,
    daily_limit: 20,
    features:    ['Basic tasks', 'PHP 20 daily limit', 'GCash & PayPal withdrawals'],
  },
  premium: {
    name:        'Premium',
    price_php:   249,
    daily_limit: 100,
    features:    ['All tasks', 'PHP 100 daily limit', 'Exclusive tasks', 'No ads', 'Priority support'],
  },
  elite: {
    name:        'Elite',
    price_php:   499,
    daily_limit: null,
    features:    ['All tasks', 'Unlimited daily earnings', 'Exclusive tasks', 'No ads', 'Early access', 'VIP support'],
  },
};

export async function getPlans(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, plans: PLANS });
}

export async function getCurrentSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, plan, starts_at, expires_at, is_active
       FROM subscriptions
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY expires_at DESC LIMIT 1`,
      [req.user!.id],
    );
    res.json({ success: true, subscription: rows[0] ?? null });
  } catch (err) { next(err); }
}

// ─── Helper: make authenticated PayMongo API request ─────────────────────────

async function paymongoPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const secret = process.env.PAYMONGO_SECRET_KEY ?? '';
  const auth   = Buffer.from(`${secret}:`).toString('base64');
  const json   = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.paymongo.com',
        path:     `/v1${path}`,
        method:   'POST',
        headers:  {
          'Authorization':  `Basic ${auth}`,
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(json),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if ((res.statusCode ?? 0) >= 400) {
              reject(new Error(`PayMongo error ${res.statusCode}: ${data}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`PayMongo invalid JSON: ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

// ─── 1. Create checkout session ───────────────────────────────────────────────

export async function createCheckout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { plan, duration_days = 30 } = req.body as {
      plan: string; duration_days?: number;
    };
    const userId = req.user!.id;

    if (!PLANS[plan] || plan === 'free') throw new ValidationError('Invalid plan selected');
    if (Number(duration_days) < 1 || Number(duration_days) > 365) {
      throw new ValidationError('Duration must be 1–365 days');
    }

    const planInfo  = PLANS[plan];
    const appUrl    = process.env.APP_URL ?? 'http://localhost:5173';

    // Insert a pending checkout row
    const { rows: checkoutRows } = await pool.query(
      `INSERT INTO subscription_checkouts
         (user_id, plan, duration_days, amount_php)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, plan, duration_days, planInfo.price_php],
    );
    const checkoutId = (checkoutRows[0] as { id: string }).id;

    // If PayMongo is not configured, return demo mode
    if (!process.env.PAYMONGO_SECRET_KEY) {
      res.json({
        success:      true,
        checkout_url: null,
        demo:         true,
        message:      'PayMongo not configured. Set PAYMONGO_SECRET_KEY to enable real payments.',
      });
      return;
    }

    // Create a PayMongo payment link
    const pmResponse = await paymongoPost('/links', {
      data: {
        attributes: {
          amount:      planInfo.price_php * 100,   // PayMongo uses centavos
          description: `Plivio ${planInfo.name} – ${duration_days} days`,
          remarks:     checkoutId,                  // used to look up in webhook
          redirect: {
            success: `${appUrl}/plans?payment=success`,
            failed:  `${appUrl}/plans?payment=failed`,
          },
        },
      },
    });

    const linkData    = pmResponse.data as Record<string, unknown>;
    const attributes  = (linkData?.attributes as Record<string, unknown>) ?? {};
    const pmRef       = (linkData?.id as string) ?? '';
    const checkoutUrl = (attributes.checkout_url as string) ?? '';

    // Save PayMongo link ID for webhook lookup
    await pool.query(
      'UPDATE subscription_checkouts SET paymongo_ref = $1 WHERE id = $2',
      [pmRef, checkoutId],
    );

    res.json({ success: true, checkout_url: checkoutUrl });
  } catch (err) { next(err); }
}

// ─── 2. PayMongo webhook ──────────────────────────────────────────────────────

/**
 * Verify PayMongo webhook signature.
 * Header format: "t=<timestamp>,te=<test_sig>,li=<live_sig>"
 * Signed payload: "<timestamp>.<rawBody>"
 */
function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) return true; // Skip verification if not configured (dev mode)

  const parts     = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=')));
  const timestamp = parts['t'] ?? '';
  const signature = parts['te'] ?? parts['li'] ?? '';

  if (!timestamp || !signature) return false;

  const payload  = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function handleWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawBody   = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
    const sigHeader = (req.headers['paymongo-signature'] as string) ?? '';

    if (!verifyWebhookSignature(rawBody, sigHeader)) {
      res.status(400).json({ success: false, error: 'Invalid webhook signature' });
      return;
    }

    const event      = req.body as Record<string, unknown>;
    const eventData  = event.data as Record<string, unknown> | undefined;
    const attributes = eventData?.attributes as Record<string, unknown> | undefined;
    const eventType  = attributes?.type as string | undefined;

    // Only handle successful payments
    if (eventType !== 'payment.paid' && eventType !== 'link.payment.paid') {
      res.json({ received: true });
      return;
    }

    const paymentData = attributes?.data as Record<string, unknown> | undefined;
    const payAttribs  = paymentData?.attributes as Record<string, unknown> | undefined;

    // PayMongo stores our checkoutId in the remarks field
    const remarks = (payAttribs?.remarks as string)
                 ?? (payAttribs?.description as string)
                 ?? '';

    if (!remarks) {
      res.json({ received: true });
      return;
    }

    // Look up the checkout session
    const { rows } = await pool.query(
      `SELECT sc.id, sc.user_id, sc.plan, sc.duration_days, sc.status, sc.amount_php,
              u.email, u.username
       FROM subscription_checkouts sc
       JOIN users u ON u.id = sc.user_id
       WHERE (sc.id = $1 OR sc.paymongo_ref = $1) AND sc.status = 'pending'
       LIMIT 1`,
      [remarks],
    );

    if (rows.length === 0) {
      res.json({ received: true });
      return;
    }

    const checkout = rows[0] as {
      id: string; user_id: string; plan: string; duration_days: number;
      status: string; amount_php: string; email: string; username: string;
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE subscription_checkouts SET status = 'paid' WHERE id = $1`,
        [checkout.id],
      );

      await client.query(
        `UPDATE subscriptions SET is_active = FALSE
         WHERE user_id = $1 AND is_active = TRUE`,
        [checkout.user_id],
      );

      const { rows: subRows } = await client.query(
        `INSERT INTO subscriptions (user_id, plan, starts_at, expires_at)
         VALUES ($1, $2, NOW(), NOW() + ($3 || ' days')::INTERVAL)
         RETURNING expires_at`,
        [checkout.user_id, checkout.plan, checkout.duration_days],
      );

      await client.query(
        `UPDATE users SET plan = $1 WHERE id = $2`,
        [checkout.plan, checkout.user_id],
      );

      await client.query('COMMIT');

      const expiresAt = new Date((subRows[0] as { expires_at: string }).expires_at);
      await sendSubscriptionConfirmEmail(
        checkout.email,
        checkout.username,
        PLANS[checkout.plan]?.name ?? checkout.plan,
        expiresAt,
      );
    } catch (inner) {
      await client.query('ROLLBACK');
      throw inner;
    } finally {
      client.release();
    }

    res.json({ received: true });
  } catch (err) { next(err); }
}

// ─── Legacy subscribe (admin manual override) ─────────────────────────────────

export async function subscribe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { plan, duration_days = 30 } = req.body as {
      plan: string; duration_days?: number;
    };
    const userId = req.user!.id;

    if (!PLANS[plan] || plan === 'free') throw new ValidationError('Invalid plan selected');
    if (Number(duration_days) < 1 || Number(duration_days) > 365) {
      throw new ValidationError('Duration must be between 1 and 365 days');
    }

    await client.query('BEGIN');
    await client.query(
      `UPDATE subscriptions SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE`,
      [userId],
    );

    const { rows } = await client.query(
      `INSERT INTO subscriptions (user_id, plan, starts_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + ($3 || ' days')::INTERVAL)
       RETURNING id, plan, starts_at, expires_at`,
      [userId, plan, duration_days],
    );

    await client.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
    await client.query('COMMIT');

    res.status(201).json({ success: true, subscription: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
