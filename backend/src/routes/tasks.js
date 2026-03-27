import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listTasks, completeTask } from '../controllers/taskController.js';

const router = Router();

// All task routes require authentication
router.use(authenticate);

router.get('/',        listTasks);
router.post('/:id/complete', completeTask);

export default router;
