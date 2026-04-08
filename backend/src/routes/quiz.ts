import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { rateLimiter }  from '../middleware/rateLimiter.ts';
import { getQuizStatus, getNextQuestion, submitAnswer } from '../controllers/quizController.ts';

const router = Router();

router.use(authenticate);

router.get('/status', getQuizStatus);
router.get('/next',   getNextQuestion);
router.post('/answer',
  rateLimiter({ max: 120, windowMs: 60_000, keyPrefix: 'quiz-answer' }),
  submitAnswer,
);

export default router;
