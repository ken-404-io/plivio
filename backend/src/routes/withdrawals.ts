import { Router } from 'express';
import { authenticate }  from '../middleware/auth.ts';
import { rateLimiter }   from '../middleware/rateLimiter.ts';
import { validateParam } from '../middleware/validate.ts';
import { requestWithdrawal, listWithdrawals, cancelWithdrawal } from '../controllers/withdrawalController.ts';

const router = Router();

router.use(authenticate);

router.get('/', listWithdrawals);

// 5 withdrawal requests per hour — prevents balance drain via rapid resubmission
router.post('/',
  rateLimiter({ max: 5, windowMs: 60 * 60_000, keyPrefix: 'wd-req' }),
  requestWithdrawal,
);

router.delete('/:id',
  validateParam('id'),
  cancelWithdrawal,
);

export default router;
