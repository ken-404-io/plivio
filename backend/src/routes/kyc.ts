import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { rateLimiter }  from '../middleware/rateLimiter.ts';
import { kycUpload }    from '../middleware/upload.ts';
import {
  submitKyc,
  getKycStatus,
  serveKycDocument,
} from '../controllers/kycController.ts';

const router = Router();

router.use(authenticate);

router.get('/status',            getKycStatus);
router.get('/document/:field',   serveKycDocument);

// Max 3 KYC submissions per hour per user
router.post(
  '/',
  rateLimiter({ max: 3, windowMs: 60 * 60_000, keyPrefix: 'kyc-submit' }),
  kycUpload.fields([
    { name: 'id_front',  maxCount: 1 },
    { name: 'id_selfie', maxCount: 1 },
  ]),
  submitKyc,
);

export default router;
