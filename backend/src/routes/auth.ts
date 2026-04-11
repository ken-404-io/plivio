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
  resendVerificationPublic,
} from '../controllers/emailAuthController.ts';
import {
  googleRedirect,   googleCallback,
  facebookRedirect, facebookCallback,
  githubRedirect,   githubCallback,
} from '../controllers/oauthController.ts';

const router = Router();

// ── Initialise CSRF cookie ─────────────────────────────────────────────────
router.get('/csrf', (_req, res) => { res.json({ ok: true }); });

// ── Registration & login ───────────────────────────────────────────────────
// Strict registration limit: 3 new accounts per IP per hour
router.post('/register',
  rateLimiter({ max: 3, windowMs: 60 * 60_000, keyPrefix: 'reg' }),
  validateBody({
    username: { required: true, type: 'username' },
    email:    { required: true, type: 'email' },
    password: { required: true, minLength: 8, maxLength: 128 },
  }),
  register,
);

// Strict brute-force protection: 10 attempts per 15 min per IP
router.post('/login',
  rateLimiter({ max: 10, windowMs: 15 * 60_000, keyPrefix: 'login' }),
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

// Public resend — used by the post-registration "check your email" screen
// and by the login page when a user tries to sign in with an unverified
// address. Rate-limited per-IP to prevent abuse.
router.post('/verify-email/resend',
  rateLimiter({ max: 5, windowMs: 60 * 60_000, keyPrefix: 'ev-resend' }),
  validateBody({ email: { required: true, type: 'email' } }),
  resendVerificationPublic,
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

// ── OAuth social login ─────────────────────────────────────────────────────
// Rate-limited to prevent abuse (e.g. someone hammering the redirect endpoints)
router.get('/google',            rateLimiter({ max: 20, windowMs: 60_000, keyPrefix: 'oa-g'  }), googleRedirect);
router.get('/google/callback',   googleCallback);

router.get('/facebook',          rateLimiter({ max: 20, windowMs: 60_000, keyPrefix: 'oa-fb' }), facebookRedirect);
router.get('/facebook/callback', facebookCallback);

router.get('/github',            rateLimiter({ max: 20, windowMs: 60_000, keyPrefix: 'oa-gh' }), githubRedirect);
router.get('/github/callback',   githubCallback);

export default router;
