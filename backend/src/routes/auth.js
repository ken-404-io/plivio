import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  register,
  login,
  logout,
  refresh,
  verify2FALogin,
  setup2FA,
  enable2FA,
  disable2FA,
} from '../controllers/authController.js';

const router = Router();

router.post('/register',
  validateBody({
    username: { required: true, type: 'username' },
    email:    { required: true, type: 'email' },
    password: { required: true, minLength: 8, maxLength: 128 },
  }),
  register
);

router.post('/login',
  validateBody({
    email:    { required: true, type: 'email' },
    password: { required: true, minLength: 1 },
  }),
  login
);

router.post('/logout', logout);

router.post('/refresh', refresh);

router.post('/2fa/verify-login',
  validateBody({ token: { required: true, minLength: 6, maxLength: 6 } }),
  verify2FALogin
);

// Protected 2FA management routes
router.post('/2fa/setup',   authenticate, setup2FA);
router.post('/2fa/enable',  authenticate, validateBody({ token: { required: true, minLength: 6 } }), enable2FA);
router.post('/2fa/disable', authenticate, validateBody({ token: { required: true, minLength: 6 } }), disable2FA);

export default router;
