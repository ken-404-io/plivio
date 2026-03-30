import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { listTasks, startTask, submitTask } from '../controllers/taskController.ts';

const router = Router();

router.use(authenticate);

router.get('/',              listTasks);
router.post('/:id/start',   startTask);
router.post('/:id/submit',  submitTask);

export default router;
