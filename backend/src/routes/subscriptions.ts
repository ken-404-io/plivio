import express, { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { validateBody }  from '../middleware/validate.ts';
import {
  getPlans,
  getCurrentSubscription,
  subscribe,
  createCheckout,
  handleWebhook,
  verifyPayment,
} from '../controllers/subscriptionController.ts';

const router = Router();

router.get('/plans', getPlans);

// ── PayMongo webhook – must receive raw body for HMAC verification ─────────
// Mount BEFORE express.json() is applied to this route
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    // Attach rawBody string for signature verification
    (req as express.Request & { rawBody?: string }).rawBody = req.body instanceof Buffer
      ? req.body.toString('utf8')
      : JSON.stringify(req.body);
    // Re-parse so controller can access req.body as plain object
    try {
      req.body = JSON.parse((req as express.Request & { rawBody?: string }).rawBody ?? '{}') as unknown;
    } catch { req.body = {}; }
    next();
  },
  handleWebhook,
);

router.use(authenticate);

router.get('/current', getCurrentSubscription);
// Verify payment after PayMongo redirect (fallback when webhook is delayed/missing)
router.post('/verify-payment', verifyPayment);

// ── PayMongo checkout (creates a payment link) ─────────────────────────────
router.post('/checkout',
  validateBody({
    plan:          { required: true, enum: ['premium', 'elite'] },
    duration_days: { type: 'int', min: 1, max: 365 },
  }),
  createCheckout,
);

// ── Legacy direct subscribe (admin / manual) ──────────────────────────────
router.post('/',
  validateBody({
    plan:          { required: true, enum: ['premium', 'elite'] },
    duration_days: { type: 'int', min: 1, max: 365 },
  }),
  subscribe,
);

export default router;
