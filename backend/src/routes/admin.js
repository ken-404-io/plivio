import { Router } from 'express';
import { adminIpWhitelist } from '../middleware/adminAuth.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  getStats,
  listUsers,
  updateUser,
  listAllTasks,
  createTask,
  updateTask,
  deleteTask,
  listPendingWithdrawals,
  processWithdrawal,
} from '../controllers/adminController.js';

const router = Router();

// All admin routes: IP whitelist → authenticated → admin flag
router.use(adminIpWhitelist, authenticate, requireAdmin);

// ─── Dashboard ──────────────────────────────────────────────────────────────
router.get('/stats', getStats);

// ─── Users ──────────────────────────────────────────────────────────────────
router.get('/users',      listUsers);
router.put('/users/:id',
  validateBody({
    is_banned:    { type: 'string', enum: ['true', 'false'] },
    is_verified:  { type: 'string', enum: ['true', 'false'] },
  }),
  updateUser
);

// ─── Tasks ──────────────────────────────────────────────────────────────────
router.get('/tasks', listAllTasks);
router.post('/tasks',
  validateBody({
    title:         { required: true, minLength: 3, maxLength: 255 },
    type:          { required: true, enum: ['captcha', 'video', 'ad_click', 'survey', 'referral'] },
    reward_amount: { required: true, type: 'number', min: 0.01 },
    min_plan:      { enum: ['free', 'premium', 'elite'] },
  }),
  createTask
);
router.put('/tasks/:id',    updateTask);
router.delete('/tasks/:id', deleteTask);

// ─── Withdrawals ────────────────────────────────────────────────────────────
router.get('/withdrawals',          listPendingWithdrawals);
router.put('/withdrawals/:id',
  validateBody({ action: { required: true, enum: ['approve', 'reject'] } }),
  processWithdrawal
);

export default router;
