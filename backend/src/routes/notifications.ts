import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { rateLimiter }  from '../middleware/rateLimiter.ts';
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from '../controllers/notificationController.ts';

const router = Router();

router.use(authenticate);

// Generous limit on the poll endpoint so frequent polling is fine
router.get('/',             rateLimiter({ max: 60, windowMs: 60_000, keyPrefix: 'notif-list' }), listNotifications);
router.get('/unread-count', rateLimiter({ max: 120, windowMs: 60_000, keyPrefix: 'notif-cnt' }), unreadCount);

router.put('/read-all', markAllRead);
router.put('/:id/read', markRead);

export default router;
