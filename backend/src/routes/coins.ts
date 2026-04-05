import { Router } from 'express';
import { authenticate }  from '../middleware/auth.ts';
import { validateBody }  from '../middleware/validate.ts';
import { rateLimiter }   from '../middleware/rateLimiter.ts';
import {
  getCoins,
  checkIn,
  recoverStreak,
  convertCoins,
  getTransactions,
} from '../controllers/coinsController.ts';

const router = Router();

router.use(authenticate);

router.get('/',             getCoins);
router.get('/transactions', getTransactions);

// Check-in: 5 per hour — controller already enforces once-per-day; this
// adds a defence-in-depth layer against scripted hammering.
router.post('/checkin',
  rateLimiter({ max: 5, windowMs: 60 * 60_000, keyPrefix: 'checkin' }),
  checkIn,
);

router.post('/streak/recover',
  rateLimiter({ max: 10, windowMs: 60 * 60_000, keyPrefix: 'streak-recover' }),
  validateBody({ method: { required: true, enum: ['ad', 'coins'] } }),
  recoverStreak,
);

router.post('/convert',
  rateLimiter({ max: 10, windowMs: 60 * 60_000, keyPrefix: 'coins-convert' }),
  validateBody({
    amount: { required: true, type: 'number', min: 50, max: 10000 },
  }),
  convertCoins,
);

export default router;
