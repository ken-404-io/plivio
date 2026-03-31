import { Router } from 'express';
import { authenticate } from '../middleware/auth.ts';
import { validateBody }  from '../middleware/validate.ts';
import { rateLimiter }   from '../middleware/rateLimiter.ts';
import {
  register,
  login,
  logout,
  refresh,
  verify2FALogin,
  setup2FA,
  enable2FA,
  disable2FA,
} from '../controllers/authController.ts';
import {
  sendEmailVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from '../controllers/emailAuthController.ts';

const router = Router();

// ── Initialise CSRF cookie ─────────────────────────────────────────────────
router.get('/csrf', (_req, res) => { res.json({ ok: true }); });

// ── Registration & login ───────────────────────────────────────────────────
router.post('/register',
  validateBody({
    username: { required: true, type: 'username' },
    email:    { required: true, type: 'email' },
    password: { required: true, minLength: 8, maxLength: 128 },
  }),
  register,
);

router.post('/login',
  validateBody({
    email:    { required: true, type: 'email' },
    password: { required: true, minLength: 1 },
  }),
  login,
);

router.post('/logout', logout);
router.post('/refresh', refresh);

router.post('/2fa/verify-login',
  validateBody({ token: { required: true, minLength: 6, maxLength: 6 } }),
  verify2FALogin,
);

router.post('/2fa/setup',   authenticate, setup2FA);
router.post('/2fa/enable',  authenticate, validateBody({ token: { required: true, minLength: 6 } }), enable2FA);
router.post('/2fa/disable', authenticate, validateBody({ token: { required: true, minLength: 6 } }), disable2FA);

// ── Email verification ─────────────────────────────────────────────────────
// Resend: max 3 per hour per user (enforced inside the controller too)
router.post('/verify-email/send',
  authenticate,
  rateLimiter({ max: 3, windowMs: 60 * 60_000, keyPrefix: 'ev-send' }),
  sendEmailVerification,
);

router.post('/verify-email',
  validateBody({ token: { required: true, minLength: 64, maxLength: 64 } }),
  verifyEmail,
);

// ── Password reset ─────────────────────────────────────────────────────────
// Strict IP-level rate limit: max 5 requests per 15 min
router.post('/forgot-password',
  rateLimiter({ max: 5, windowMs: 15 * 60_000, keyPrefix: 'fp' }),
  validateBody({ email: { required: true, type: 'email' } }),
  forgotPassword,
);

router.post('/reset-password',
  rateLimiter({ max: 5, windowMs: 15 * 60_000, keyPrefix: 'rp' }),
  validateBody({
    token:    { required: true, minLength: 64, maxLength: 64 },
    password: { required: true, minLength: 8,  maxLength: 128 },
  }),
  resetPassword,
);

export default router;
