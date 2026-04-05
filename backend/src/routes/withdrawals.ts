import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { requestWithdrawal, listWithdrawals, cancelWithdrawal } from '../controllers/withdrawalController.ts';

const router = Router();

router.use(authenticate);

router.get('/',     listWithdrawals);
router.post('/',    requestWithdrawal);
router.delete('/:id', cancelWithdrawal);

export default router;
