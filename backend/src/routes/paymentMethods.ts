import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { rateLimiter }  from '../middleware/rateLimiter.ts';
import {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from '../controllers/paymentMethodController.ts';

const router = Router();

router.use(authenticate);

router.get('/', listPaymentMethods);

// Writes are lightly rate-limited to discourage brute-forcing account numbers
// against the global uniqueness index.
router.post('/',
  rateLimiter({ max: 10, windowMs: 60 * 60_000, keyPrefix: 'pm-create' }),
  createPaymentMethod,
);

router.put('/:id',    updatePaymentMethod);
router.delete('/:id', deletePaymentMethod);

export default router;
