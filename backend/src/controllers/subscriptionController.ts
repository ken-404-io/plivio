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
 *   PAYMONGO_SECRET_KEY    – sk_test_… or sk_live_…
 *   PAYMONGO_WEBHOOK_SECRET – whsk_… (from PayMongo dashboard)
 */
import crypto from 'crypto';
import https  from 'https';
import type { Request, Response, NextFunction } from 'express';
import pool from '../config/db.ts';
import { ValidationError, NotFoundError } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';
import {
  sendSubscriptionConfirmEmail,
} from '../services/email.ts';

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
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/json',
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
    const { plan, duration_days = 30, success_url, failed_url } = req.body as {
      plan: string; duration_days?: number; success_url?: string; failed_url?: string;
    };
    const userId = req.user!.id;

    if (!PLANS[plan] || plan === 'free') throw new ValidationError('Invalid plan selected');
    if (Number(duration_days) < 1 || Number(duration_days) > 365) {
      throw new ValidationError('Duration must be 1–365 days');
    }

    const planInfo   = PLANS[plan];
    const amountPhp  = planInfo.price_php;
    const appUrl     = process.env.APP_URL ?? 'http://localhost:5173';
    const successUrl = success_url ?? `${appUrl}/plans?payment=success`;
    const failedUrl  = failed_url  ?? `${appUrl}/plans?payment=failed`;

    // Insert a pending checkout row to track this payment attempt
    const { rows: checkoutRows } = await pool.query(
      `INSERT INTO subscription_checkouts
         (user_id, plan, duration_days, amount_php)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, plan, duration_days, amountPhp],
    );
    const checkoutId = (checkoutRows[0] as { id: string }).id;

    // If PayMongo is not configured fall back to demo mode
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
          amount:      amountPhp * 100,           // PayMongo uses centavos
          description: `Plivio ${planInfo.name} – ${duration_days} days`,
          remarks:     checkoutId,                // used to look up in webhook
          redirect:    {
            success: successUrl,
            failed:  failedUrl,
          },
        },
      },
    });

    const linkData   = (pmResponse.data as Record<string, unknown>);
    const attributes = (linkData?.attributes as Record<string, unknown>) ?? {};
    const pmRef      = (linkData?.id as string) ?? '';
    const checkoutUrl = (attributes.checkout_url as string) ?? '';

    // Save PayMongo link ID for webhook lookup
    await pool.query(
      'UPDATE subscription_checkouts SET paymongo_ref = $1 WHERE id = $2',
      [pmRef, checkoutId],
    );

    res.json({ success: true, checkout_url: checkoutUrl });
  } catch (err) { next(err); }
}

// ─── Helper: make authenticated PayMongo GET request ─────────────────────────

async function paymongoGet(path: string): Promise<Record<string, unknown>> {
  const secret = process.env.PAYMONGO_SECRET_KEY ?? '';
  const auth   = Buffer.from(`${secret}:`).toString('base64');

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.paymongo.com',
        path:     `/v1${path}`,
        method:   'GET',
        headers:  { 'Authorization': `Basic ${auth}` },
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
    req.end();
  });
}

// ─── Helper: activate subscription (shared by webhook + verify) ───────────────

async function activateSubscription(checkout: {
  id: string; user_id: string; plan: string;
  duration_days: number; email: string; username: string;
}): Promise<Date> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (checkout.id !== 'admin-override') {
      await client.query(
        `UPDATE subscription_checkouts SET status = 'paid' WHERE id = $1`,
        [checkout.id],
      );
    }

    await client.query(
      `UPDATE subscriptions SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE`,
      [checkout.user_id],
    );

    const { rows: subRows } = await client.query(
      `INSERT INTO subscriptions (user_id, plan, starts_at, expires_at)
       VALUES ($1, $2::plan_type, NOW(), NOW() + ($3 || ' days')::INTERVAL)
       RETURNING expires_at`,
      [checkout.user_id, checkout.plan, checkout.duration_days],
    );

    await client.query(
      `UPDATE users SET plan = $1::plan_type WHERE id = $2`,
      [checkout.plan, checkout.user_id],
    );

    await client.query('COMMIT');

    const expiresAt = new Date((subRows[0] as { expires_at: string }).expires_at);

    // Send confirmation email (non-fatal)
    sendSubscriptionConfirmEmail(
      checkout.email, checkout.username,
      PLANS[checkout.plan]?.name ?? checkout.plan, expiresAt,
    ).catch(() => {});

    return expiresAt;
  } catch (inner) {
    await client.query('ROLLBACK');
    throw inner;
  } finally {
    client.release();
  }
}

// ─── 3. Verify payment after redirect (fallback when webhook is delayed) ──────



export async function verifyPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    // Find the most recent pending checkout for this user
    const { rows } = await pool.query(
      `SELECT sc.id, sc.user_id, sc.plan, sc.duration_days, sc.paymongo_ref,
              sc.status, sc.amount_php, u.email, u.username
       FROM subscription_checkouts sc
       JOIN users u ON u.id = sc.user_id
       WHERE sc.user_id = $1 AND sc.status = 'pending'
       ORDER BY sc.created_at DESC LIMIT 1`,
      [userId],
    );

    if (rows.length === 0) {
      // No pending checkout — check if webhook already processed it
      const { rows: activeSub } = await pool.query(
        `SELECT plan FROM subscriptions
         WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
         ORDER BY expires_at DESC LIMIT 1`,
        [userId],
      );
      logger.info({ userId }, '🔍 verifyPayment: no pending checkout found');
      res.json({
        success:   true,
        activated: activeSub.length > 0,
        plan:      (activeSub[0] as { plan: string } | undefined)?.plan ?? null,
      });
      return;
    }

    const checkout = rows[0] as {
      id: string; user_id: string; plan: string; duration_days: number;
      paymongo_ref: string | null; status: string;
      amount_php: string; email: string; username: string;
    };

    logger.info({
      userId,
      checkoutId:   checkout.id,
      plan:         checkout.plan,
      paymongo_ref: checkout.paymongo_ref,
      hasKey:       !!process.env.PAYMONGO_SECRET_KEY,
    }, '🔍 verifyPayment: checking checkout');

    // Can't verify without PayMongo configured
    if (!checkout.paymongo_ref || !process.env.PAYMONGO_SECRET_KEY) {
      logger.warn({ userId, paymongo_ref: checkout.paymongo_ref }, '⚠️ verifyPayment: PayMongo not configured or missing ref');
      res.json({ success: true, activated: false, message: 'PayMongo not configured' });
      return;
    }

    // Query PayMongo for the link payment status
    let status = '';
    try {
      const linkRes  = await paymongoGet(`/links/${checkout.paymongo_ref}`);
      const linkData = (linkRes.data as Record<string, unknown>);
      const attrs    = (linkData?.attributes as Record<string, unknown>) ?? {};
      status = attrs.status as string;

      logger.info({ userId, paymongo_ref: checkout.paymongo_ref, status, attrs }, '🔍 verifyPayment: PayMongo link status');
    } catch (pmErr) {
      logger.error({ userId, err: (pmErr as Error).message }, '❌ verifyPayment: PayMongo API error');
      res.json({ success: true, activated: false, message: 'Could not reach PayMongo API' });
      return;
    }

    if (status !== 'paid') {
      res.json({ success: true, activated: false, paymongo_status: status });
      return;
    }

    // Payment confirmed by PayMongo — activate now
    const expiresAt = await activateSubscription(checkout);
    logger.info({ userId, plan: checkout.plan }, '✅ verifyPayment: subscription activated');

    res.json({
      success:    true,
      activated:  true,
      plan:       checkout.plan,
      expires_at: expiresAt,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, userId: req.user?.id }, '❌ verifyPayment error');
    next(err);
  }
}

// ─── 4. Admin: manually activate subscription ─────────────────────────────────

export async function adminActivateSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user_id, plan, duration_days = 30 } = req.body as {
      user_id: string; plan: string; duration_days?: number;
    };

    if (!PLANS[plan] || plan === 'free') throw new ValidationError('Invalid plan');

    const { rows: userRows } = await pool.query(
      'SELECT id, email, username FROM users WHERE id = $1',
      [user_id],
    );
    if (!userRows.length) throw new NotFoundError('User not found');

    const user = userRows[0] as { id: string; email: string; username: string };

    await activateSubscription({
      id:           'admin-override',   // no checkout row to update
      user_id:      user.id,
      plan,
      duration_days: Number(duration_days),
      email:        user.email,
      username:     user.username,
    });

    logger.info({ user_id, plan, by: req.user?.id }, '✅ Admin manually activated subscription');
    res.json({ success: true, message: `${plan} activated for user ${user_id}` });
  } catch (err) { next(err); }
}

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

  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function handleWebhook(
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): Promise<void> {
  // IMPORTANT: always respond 200 — PayMongo disables the webhook on any 4xx/5xx response.
  // Errors are logged but never surfaced as non-2xx to PayMongo.
  try {
    // Express must NOT parse this route as JSON — raw body needed for HMAC
    const rawBody        = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
    const sigHeader      = (req.headers['paymongo-signature'] as string) ?? '';

    if (!verifyWebhookSignature(rawBody, sigHeader)) {
      logger.warn({ sigHeader: sigHeader.slice(0, 80) }, '⚠️ Webhook: invalid signature — ignoring (acknowledged 200)');
      res.json({ received: true });
      return;
    }

    const event      = req.body as Record<string, unknown>;
    const eventData  = event.data as Record<string, unknown> | undefined;
    const attributes = eventData?.attributes as Record<string, unknown> | undefined;
    const eventType  = attributes?.type as string | undefined;

    logger.info({ eventType, eventId: eventData?.id, payload: JSON.stringify(event).slice(0, 1000) }, '📨 Webhook received');

    // Only handle successful payments
    if (eventType !== 'payment.paid' && eventType !== 'link.payment.paid') {
      logger.info({ eventType }, '⏭ Webhook: ignored event type');
      res.json({ received: true });
      return;
    }

    const paymentData  = attributes?.data as Record<string, unknown> | undefined;
    const payAttribs   = paymentData?.attributes as Record<string, unknown> | undefined;

    logger.info({
      paymentDataId:   paymentData?.id,
      paymentDataType: paymentData?.type,
      remarks:         payAttribs?.remarks,
      description:     payAttribs?.description,
      reference:       payAttribs?.reference_number,
      status:          payAttribs?.status,
    }, '🔍 Webhook: payment data extracted');

    // Try remarks first (our checkoutId), then link ID, then paymongo_ref lookup
    const remarks = (payAttribs?.remarks as string)
                 ?? (payAttribs?.reference_number as string)
                 ?? '';

    // Also capture the link/payment ID for paymongo_ref lookup
    const pmId = (paymentData?.id as string) ?? '';

    if (!remarks && !pmId) {
      logger.warn({ payAttribs }, '⚠️ Webhook: no remarks or ID to look up checkout');
      res.json({ received: true });
      return;
    }

    // Look up the checkout session by remarks (checkoutId), paymongo_ref (link ID), or payment ID
    const { rows } = await pool.query(
      `SELECT sc.id, sc.user_id, sc.plan, sc.duration_days, sc.status, sc.amount_php,
              u.email, u.username
       FROM subscription_checkouts sc
       JOIN users u ON u.id = sc.user_id
       WHERE (sc.id = $1 OR sc.paymongo_ref = $1 OR sc.paymongo_ref = $2) AND sc.status = 'pending'
       LIMIT 1`,
      [remarks || pmId, pmId],
    );

    logger.info({ remarks, pmId, found: rows.length }, '🔍 Webhook: checkout lookup result');

    if (rows.length === 0) {
      // Already processed or unknown — acknowledge to stop retries
      logger.warn({ remarks, pmId }, '⚠️ Webhook: no pending checkout found');
      res.json({ received: true });
      return;
    }

    const checkout = rows[0] as {
      id: string; user_id: string; plan: string; duration_days: number;
      status: string; amount_php: string; email: string; username: string;
    };

    await activateSubscription(checkout);
    res.json({ received: true });
  } catch (err) {
    // Log but still acknowledge — prevents PayMongo from disabling the webhook
    logger.error({ err: (err as Error).message }, '❌ Webhook: processing error (still acknowledged 200)');
    res.json({ received: true });
  }
}

// ─── Legacy subscribe (kept for admin manual override) ───────────────────────

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
