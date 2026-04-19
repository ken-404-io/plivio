import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { rateLimiter }  from '../middleware/rateLimiter.ts';
import { validateParam } from '../middleware/validate.ts';
import {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
} from '../controllers/paymentMethodController.ts';

const router = Router();

router.use(authenticate);

router.get('/', listPaymentMethods);

const writeLimit = rateLimiter({ max: 10, windowMs: 60 * 60_000, keyPrefix: 'pm-write' });

router.post('/',     writeLimit, createPaymentMethod);
router.put('/:id',   validateParam('id'), writeLimit, updatePaymentMethod);
router.delete('/:id', validateParam('id'), writeLimit, deletePaymentMethod);

export default router;
