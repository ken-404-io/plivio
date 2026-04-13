import { Router } from 'express';
import { authenticate }  from '../middleware/auth.ts';
import { rateLimiter }   from '../middleware/rateLimiter.ts';
import { validateIntParam } from '../middleware/validate.ts';
import { requestWithdrawal, listWithdrawals, cancelWithdrawal, getWithdrawalCooldown } from '../controllers/withdrawalController.ts';

const router = Router();

router.use(authenticate);

router.get('/', listWithdrawals);
router.get('/cooldown', getWithdrawalCooldown);

// 5 withdrawal requests per hour — prevents balance drain via rapid resubmission
router.post('/',
  rateLimiter({ max: 5, windowMs: 60 * 60_000, keyPrefix: 'wd-req' }),
  requestWithdrawal,
);

router.delete('/:id',
  validateIntParam('id'),
  cancelWithdrawal,
);

export default router;
