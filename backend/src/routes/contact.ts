import { Router } from 'express';
import { sendContact } from '../controllers/contactController.ts';
import { rateLimiter } from '../middleware/rateLimiter.ts';

const router = Router();

// 5 contact form submissions per IP per 15 minutes
router.post('/', rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }), sendContact);

export default router;
