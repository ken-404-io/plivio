import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getPlans, getCurrentSubscription, subscribe } from '../controllers/subscriptionController.js';

const router = Router();

router.get('/plans', getPlans); // Public – no auth needed

router.use(authenticate);

router.get('/current', getCurrentSubscription);

router.post('/',
  validateBody({
    plan:          { required: true, enum: ['premium', 'elite'] },
    duration_days: { type: 'int', min: 1, max: 365 },
  }),
  subscribe
);

export default router;
