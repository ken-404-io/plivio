import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { validateBody }  from '../middleware/validate.ts';
import {
  getPlans,
  getCurrentSubscription,
  subscribe,
  createCheckout,
  handleWebhook,
} from '../controllers/subscriptionController.ts';

const router = Router();

router.get('/plans', getPlans);

// ── Xendit webhook – plain JSON, verified via x-callback-token header ──────
router.post('/webhook', handleWebhook);

router.use(authenticate);

router.get('/current', getCurrentSubscription);

// ── Xendit checkout (creates an invoice) ──────────────────────────────────
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
