import { Router } from 'express';
import { adminIpWhitelist } from '../middleware/adminAuth.ts';
import { authenticate, requireAdmin } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import {
  getStats,
  listUsers,
  updateUser,
  listAllTasks,
  createTask,
  updateTask,
  deleteTask,
  updateAdNetworks,
  listPendingWithdrawals,
  processWithdrawal,
} from '../controllers/adminController.ts';

const router = Router();

router.use(adminIpWhitelist, authenticate, requireAdmin);

router.get('/stats', getStats);

router.get('/users',      listUsers);
router.put('/users/:id',
  validateBody({
    is_banned:   { type: 'string', enum: ['true', 'false'] },
    is_verified: { type: 'string', enum: ['true', 'false'] },
  }),
  updateUser
);

router.get('/tasks',  listAllTasks);
router.post('/tasks',
  validateBody({
    title:         { required: true, minLength: 3, maxLength: 255 },
    type:          { required: true, enum: ['captcha', 'video', 'ad_click', 'survey', 'referral'] },
    reward_amount: { required: true, type: 'number', min: 0.01 },
    min_plan:      { enum: ['free', 'premium', 'elite'] },
  }),
  createTask
);
router.put('/tasks/:id',              updateTask);
router.put('/tasks/:id/ad-networks',  updateAdNetworks);
router.delete('/tasks/:id',           deleteTask);

router.get('/withdrawals',      listPendingWithdrawals);
router.put('/withdrawals/:id',
  validateBody({ action: { required: true, enum: ['approve', 'reject'] } }),
  processWithdrawal
);

export default router;
