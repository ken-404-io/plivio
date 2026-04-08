import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { validateBody }  from '../middleware/validate.ts';
import { requireAdmin } from '../middleware/auth.ts';
import {
  getPlans,
  getCurrentSubscription,
  subscribe,
  createCheckout,
  handleWebhook,
  verifyPayment,
  adminActivateSubscription,
} from '../controllers/subscriptionController.ts';

const router = Router();

router.get('/plans', getPlans);

// ── PayMongo webhook ───────────────────────────────────────────────────────
// rawBody is captured by the global express.json() verify callback in index.ts
// (raw bytes must be captured before parsing — express.raw() here is too late)
router.post('/webhook', handleWebhook);

router.use(authenticate);

router.get('/current', getCurrentSubscription);
// Verify payment after PayMongo redirect (fallback when webhook is delayed/missing)
router.post('/verify-payment', verifyPayment);

// ── PayMongo checkout (creates a payment link) ─────────────────────────────
router.post('/checkout',
  validateBody({
    plan:          { required: true, enum: ['premium', 'elite'] },
    duration_days: { type: 'int', min: 1, max: 365 },
    success_url:   {},
    failed_url:    {},
  }),
  createCheckout,
);

// ── Admin: manually activate subscription for any user ────────────────────
router.post('/admin/activate',
  requireAdmin,
  validateBody({
    user_id:       { required: true },
    plan:          { required: true, enum: ['premium', 'elite'] },
    duration_days: { type: 'int', min: 1, max: 365 },
  }),
  adminActivateSubscription,
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
