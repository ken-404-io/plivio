import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { getPublicKey, subscribe, unsubscribe } from '../controllers/pushController.ts';

const router = Router();

router.get('/key',        getPublicKey);
router.use(authenticate);
router.post('/subscribe',   subscribe);
router.delete('/subscribe', unsubscribe);

export default router;
