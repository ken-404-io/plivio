/**
 * Subscription controller with Xendit payment integration.
 *
 * Flow:
 *  1. POST /subscriptions/checkout  – creates a Xendit invoice,
 *     stores a pending checkout row, returns { checkout_url }.
 *  2. User pays on Xendit's hosted page.
 *  3. Xendit fires a webhook → POST /subscriptions/webhook.
 *  4. Webhook verifies x-callback-token, marks checkout as paid,
 *     activates the subscription and sends a confirmation email.
 *
 * Environment variables needed:
 *   XENDIT_SECRET_KEY      – starts with xnd_production_... or xnd_development_...
 *   XENDIT_WEBHOOK_TOKEN   – callback token set in Xendit dashboard
 */
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

// ─── Helper: POST to Xendit API ───────────────────────────────────────────────

async function xenditPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const secret = process.env.XENDIT_SECRET_KEY ?? '';
  const auth   = Buffer.from(`${secret}:`).toString('base64');
  const json   = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.xendit.co',
        path,
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
              reject(new Error(`Xendit error ${res.statusCode}: ${data}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Xendit invalid JSON: ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

// ─── 1. Create checkout (Xendit Invoice) ─────────────────────────────────────

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

    // If Xendit is not configured, return demo mode
    if (!process.env.XENDIT_SECRET_KEY) {
      res.json({
        success:      true,
        checkout_url: null,
        demo:         true,
        message:      'Xendit not configured. Set XENDIT_SECRET_KEY to enable real payments.',
      });
      return;
    }

    // Create a Xendit invoice
    const invoice = await xenditPost('/v2/invoices', {
      external_id:          checkoutId,
      amount:               planInfo.price_php,
      currency:             'PHP',
      description:          `Plivio ${planInfo.name} – ${duration_days} days`,
      invoice_duration:     86400,                         // 24h to pay
      success_redirect_url: `${appUrl}/plans?payment=success`,
      failure_redirect_url: `${appUrl}/plans?payment=failed`,
      items: [{
        name:     `Plivio ${planInfo.name}`,
        quantity: 1,
        price:    planInfo.price_php,
        category: 'Subscription',
      }],
      fees: [],
    });

    const xenditId   = invoice.id   as string;
    const invoiceUrl = invoice.invoice_url as string;

    // Save Xendit invoice ID for webhook lookup
    await pool.query(
      'UPDATE subscription_checkouts SET paymongo_ref = $1 WHERE id = $2',
      [xenditId, checkoutId],
    );

    res.json({ success: true, checkout_url: invoiceUrl });
  } catch (err) { next(err); }
}

// ─── 2. Xendit webhook ────────────────────────────────────────────────────────

export async function handleWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Verify webhook token
    const token         = process.env.XENDIT_WEBHOOK_TOKEN;
    const receivedToken = req.headers['x-callback-token'] as string | undefined;

    if (token && receivedToken !== token) {
      res.status(401).json({ success: false, error: 'Invalid webhook token' });
      return;
    }

    const event = req.body as Record<string, unknown>;

    // Only handle paid invoices
    if (event.status !== 'PAID' && event.status !== 'SETTLED') {
      res.json({ received: true });
      return;
    }

    const externalId = event.external_id as string | undefined;
    const xenditId   = event.id          as string | undefined;

    if (!externalId && !xenditId) {
      res.json({ received: true });
      return;
    }

    // Look up the checkout session by external_id (our checkoutId) or xendit invoice id
    const { rows } = await pool.query(
      `SELECT sc.id, sc.user_id, sc.plan, sc.duration_days, sc.status, sc.amount_php,
              u.email, u.username
       FROM subscription_checkouts sc
       JOIN users u ON u.id = sc.user_id
       WHERE (sc.id = $1 OR sc.paymongo_ref = $2) AND sc.status = 'pending'
       LIMIT 1`,
      [externalId ?? '', xenditId ?? ''],
    );

    if (rows.length === 0) {
      // Already processed or unknown — acknowledge to stop retries
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

      // Mark checkout as paid
      await client.query(
        `UPDATE subscription_checkouts SET status = 'paid' WHERE id = $1`,
        [checkout.id],
      );

      // Deactivate existing active subscription
      await client.query(
        `UPDATE subscriptions SET is_active = FALSE
         WHERE user_id = $1 AND is_active = TRUE`,
        [checkout.user_id],
      );

      // Create new subscription
      const { rows: subRows } = await client.query(
        `INSERT INTO subscriptions (user_id, plan, starts_at, expires_at)
         VALUES ($1, $2, NOW(), NOW() + ($3 || ' days')::INTERVAL)
         RETURNING expires_at`,
        [checkout.user_id, checkout.plan, checkout.duration_days],
      );

      // Update user plan
      await client.query(
        `UPDATE users SET plan = $1 WHERE id = $2`,
        [checkout.plan, checkout.user_id],
      );

      await client.query('COMMIT');

      // Send confirmation email (non-fatal)
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
