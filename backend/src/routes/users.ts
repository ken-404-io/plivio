import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validate.ts';
import {
  getMe,
  getEarnings,
  getReferrals,
  changePassword,
  uploadAvatar,
  requestEmailChange,
  confirmEmailChange,
  heartbeat,
  dismissRestorationMessage,
} from '../controllers/userController.ts';
import { avatarUpload } from '../middleware/upload.ts';

const router = Router();

router.use(authenticate);

router.get('/me',            getMe);
router.post('/me/heartbeat', heartbeat);
router.get('/me/earnings',   getEarnings);
router.get('/me/referrals',  getReferrals);

router.put('/me/password',
  validateBody({
    current_password: { required: true, minLength: 1 },
    new_password:     { required: true, minLength: 8, maxLength: 128 },
  }),
  changePassword
);

// Avatar upload — multipart/form-data, field name "avatar"
router.post('/me/avatar', avatarUpload.single('avatar'), uploadAvatar);

// Email change (two-step: request then confirm)
router.post('/me/change-email',
  validateBody({ new_email: { required: true } }),
  requestEmailChange
);
router.post('/me/confirm-email-change',
  validateBody({ token: { required: true } }),
  confirmEmailChange
);

router.post('/me/dismiss-restoration', dismissRestorationMessage);

export default router;
