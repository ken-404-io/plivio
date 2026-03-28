import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import { getPlans, getCurrentSubscription, subscribe } from '../controllers/subscriptionController.ts';

const router = Router();

router.get('/plans', getPlans);

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
