import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { listTasks, completeTask } from '../controllers/taskController.ts';

const router = Router();

router.use(authenticate);
router.get('/',              listTasks);
router.post('/:id/complete', completeTask);

export default router;
