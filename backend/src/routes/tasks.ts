import { Router } from 'express';
import { authenticate }  from '../middleware/auth.ts';
import { rateLimiter }   from '../middleware/rateLimiter.ts';
import { validateParam } from '../middleware/validate.ts';
import { listTasks, startTask, submitTask, cancelTask } from '../controllers/taskController.ts';

const router = Router();

router.use(authenticate);

router.get('/', listTasks);

// Start/submit are capped to prevent automated scripting.
// The controller also enforces per-task daily completion limits via DB.
router.post('/start/:id',
  validateParam('id'),
  rateLimiter({ max: 60, windowMs: 60_000, keyPrefix: 'task-start' }),
  startTask,
);

router.post('/submit/:id',
  validateParam('id'),
  rateLimiter({ max: 60, windowMs: 60_000, keyPrefix: 'task-submit' }),
  submitTask,
);

router.post('/cancel/:id',
  validateParam('id'),
  cancelTask,
);

export default router;
