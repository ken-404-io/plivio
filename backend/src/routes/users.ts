import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { getMe, getEarnings, getReferrals } from '../controllers/userController.ts';

const router = Router();

router.use(authenticate);
router.get('/me',           getMe);
router.get('/me/earnings',  getEarnings);
router.get('/me/referrals', getReferrals);

export default router;
