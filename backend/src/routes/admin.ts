import { Router } from 'express';
import { adminIpWhitelist } from '../middleware/adminAuth.ts';
import { authenticate, requireAdmin } from '../middleware/auth.ts';
import { validateBody, validateParam } from '../middleware/validate.ts';
import { rateLimiter } from '../middleware/rateLimiter.ts';
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
import { listKycSubmissions, reviewKyc } from '../controllers/kycController.ts';

const router = Router();

// All admin routes require: IP allowlist + authenticated session + admin flag.
// Also rate-limited separately from the public limiter so normal traffic doesn't
// consume the admin budget.
router.use(
  adminIpWhitelist,
  authenticate,
  requireAdmin,
  rateLimiter({ max: 200, windowMs: 60_000, keyPrefix: 'admin' }),
);

router.get('/stats', getStats);

router.get('/users', listUsers);
router.put('/users/:id',
  validateParam('id'),
  validateBody({
    is_banned:   { type: 'string', enum: ['true', 'false'] },
    is_verified: { type: 'string', enum: ['true', 'false'] },
  }),
  updateUser,
);

router.get('/tasks', listAllTasks);
router.post('/tasks',
  validateBody({
    title:         { required: true, minLength: 3, maxLength: 255 },
    type:          { required: true, enum: ['captcha', 'video', 'ad_click', 'survey', 'referral'] },
    reward_amount: { required: true, type: 'number', min: 0.01 },
    min_plan:      { enum: ['free', 'premium', 'elite'] },
  }),
  createTask,
);
router.put('/tasks/:id',             validateParam('id'), updateTask);
router.put('/tasks/:id/ad-networks', validateParam('id'), updateAdNetworks);
router.delete('/tasks/:id',          validateParam('id'), deleteTask);

router.get('/withdrawals', listPendingWithdrawals);
router.put('/withdrawals/:id',
  validateParam('id'),
  validateBody({ action: { required: true, enum: ['approve', 'reject'] } }),
  processWithdrawal,
);

router.get('/kyc', listKycSubmissions);
router.put('/kyc/:id',
  validateParam('id'),
  validateBody({
    action: { required: true, enum: ['approve', 'reject'] },
    reason: {},
  }),
  reviewKyc,
);

export default router;
