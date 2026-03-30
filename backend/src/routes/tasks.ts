import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { listTasks, startTask, submitTask } from '../controllers/taskController.ts';

console.log('[tasks router] startTask:', typeof startTask, '| submitTask:', typeof submitTask);

const router = Router();

router.use(authenticate);

router.get('/',              listTasks);
router.post('/start/:id',   startTask);
router.post('/submit/:id',  submitTask);

router.use((req, res) => {
  console.log('[tasks router] no match:', req.method, req.url);
  res.status(404).json({ success: false, error: 'Task endpoint not found' });
});

export default router;
