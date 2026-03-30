import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { getMe, getEarnings, getReferrals, changePassword } from '../controllers/userController.ts';
import { validateBody } from '../middleware/validate.ts';

const router = Router();

router.use(authenticate);
router.get('/me',           getMe);
router.get('/me/earnings',  getEarnings);
router.get('/me/referrals', getReferrals);

router.put('/me/password',
  validateBody({
    current_password: { required: true, minLength: 1 },
    new_password:     { required: true, minLength: 8, maxLength: 128 },
  }),
  changePassword
);

export default router;
