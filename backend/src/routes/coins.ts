import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import {
  getCoins,
  checkIn,
  recoverStreak,
  convertCoins,
  getTransactions,
} from '../controllers/coinsController.ts';

const router = Router();

router.use(authenticate);

router.get('/',              getCoins);
router.post('/checkin',      checkIn);
router.post('/streak/recover',
  validateBody({ method: { required: true, enum: ['ad', 'coins'] } }),
  recoverStreak,
);
router.post('/convert',
  validateBody({
    amount: { required: true, type: 'number', min: 50, max: 10000 },
  }),
  convertCoins,
);
router.get('/transactions',  getTransactions);

export default router;
