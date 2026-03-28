import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import { requestWithdrawal, listWithdrawals } from '../controllers/withdrawalController.ts';

const router = Router();

router.use(authenticate);

router.get('/', listWithdrawals);

router.post('/',
  validateBody({
    amount: { required: true, type: 'number', min: 50, max: 5000 },
    method: { required: true, enum: ['gcash', 'paypal'] },
  }),
  requestWithdrawal
);

export default router;
