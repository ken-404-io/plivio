import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.ts';
import { validateBody, validateParam, validateIntParam } from '../middleware/validate.ts';
import { rateLimiter } from '../middleware/rateLimiter.ts';
import {
  getStats,
  listUsers,
  updateUser,
  getUserDetails,
  notifyUser,
  broadcastNotification,
  broadcastEmail,
  listAllTasks,
  createTask,
  updateTask,
  deleteTask,
  updateAdNetworks,
  listPendingWithdrawals,
  listWithdrawalHistory,
  processWithdrawal,
  resetUserDevice,
  listReferrals,
  listNotificationLogs,
  exportCsv,
} from '../controllers/adminController.ts';
import { listKycSubmissions, reviewKyc } from '../controllers/kycController.ts';

const router = Router();

// All admin routes require: IP allowlist + authenticated session + admin flag.
// Also rate-limited separately from the public limiter so normal traffic doesn't
// consume the admin budget.
router.use(
  authenticate,
  requireAdmin,
  rateLimiter({ max: 200, windowMs: 60_000, keyPrefix: 'admin' }),
);

router.get('/stats', getStats);

router.post('/notify',
  validateBody({
    user_id: { required: true },
    title:   { required: true, minLength: 1, maxLength: 200 },
    message: { required: true, minLength: 1, maxLength: 2000 },
    link:    {},
  }),
  notifyUser,
);
router.post('/notify-all',
  validateBody({
    title:   { required: true, minLength: 1, maxLength: 200 },
    message: { required: true, minLength: 1, maxLength: 2000 },
    link:    {},
  }),
  broadcastNotification,
);
router.post('/email-everyone',
  validateBody({
    subject: { required: true, minLength: 1, maxLength: 200 },
    message: { required: true, minLength: 1, maxLength: 5000 },
  }),
  broadcastEmail,
);

router.get('/users', listUsers);
router.get('/users/:id/details', validateParam('id'), getUserDetails);
router.put('/users/:id/reset-device', validateParam('id'), resetUserDevice);
router.put('/users/:id',
  validateParam('id'),
  validateBody({
    is_banned:          { type: 'string', enum: ['true', 'false'] },
    is_verified:        { type: 'string', enum: ['true', 'false'] },
    plan:               { type: 'string', enum: ['free', 'premium', 'elite'] },
    balance_adjustment: { type: 'number' },
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
router.get('/withdrawals/history', listWithdrawalHistory);
router.put('/withdrawals/:id',
  validateIntParam('id'),
  validateBody({ action: { required: true, enum: ['approve', 'reject'] } }),
  processWithdrawal,
);

router.get('/referrals', listReferrals);
router.get('/notifications', listNotificationLogs);
router.get('/export/:section', exportCsv);

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
