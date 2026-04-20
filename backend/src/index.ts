import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { connectDB } from './config/db.ts';
import pool         from './config/db.ts';
import { connectRedis } from './config/redis.ts';
import { logger } from './utils/logger.ts';
import { AppError } from './utils/errors.ts';
import { rateLimiter } from './middleware/rateLimiter.ts';
import { csrfMiddleware } from './middleware/csrf.ts';
import { createNotification } from './utils/notify.ts';
import { sendPushToUser }    from './controllers/pushController.ts';
import { sendKycStatusEmail } from './services/email.ts';
// Cloudinary serves avatars/KYC images — no local AVATARS_DIR needed

import { reconcilePendingCheckouts } from './controllers/subscriptionController.ts';
import { runPromotionsTick } from './jobs/promotionsScheduler.ts';
import authRoutes         from './routes/auth.ts';
import taskRoutes         from './routes/tasks.ts';
import userRoutes         from './routes/users.ts';
import withdrawalRoutes   from './routes/withdrawals.ts';
import paymentMethodRoutes from './routes/paymentMethods.ts';
import subscriptionRoutes from './routes/subscriptions.ts';
import adminRoutes        from './routes/admin.ts';
import notificationRoutes from './routes/notifications.ts';
import kycRoutes          from './routes/kyc.ts';
import contactRoutes      from './routes/contact.ts';
import coinsRoutes        from './routes/coins.ts';
import pushRoutes         from './routes/push.ts';
import quizRoutes         from './routes/quiz.ts';

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// Trust the first hop reverse proxy (Nginx, Cloudflare, Railway, Render, etc.)
// so that req.ip resolves to the real client IP rather than the proxy IP.
// Without this, all rate limiting is keyed on the proxy's IP — effectively disabled.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'"],           // removed unsafe-inline
      imgSrc:      ["'self'", 'data:', 'https:', 'https://res.cloudinary.com'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],           // no iframes on API responses
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, Postman in dev)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  exposedHeaders: ['X-CSRF-Token'],
}));

// Skip JSON body parsing for the PayMongo webhook — it needs the raw Buffer
// for HMAC signature verification. Any other route gets the JSON parser.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && req.path === '/api/subscriptions/webhook') return next();
  express.json({ limit: '16kb' })(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cookieParser());
// Skip rate-limiting for PayMongo webhook — server-to-server, may retry rapidly
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && req.path === '/api/subscriptions/webhook') return next();
  return rateLimiter()(req, res, next);
});
app.use(csrfMiddleware);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Avatars and KYC documents are now served from Cloudinary.
// Legacy local uploads path kept as a no-op for backwards compatibility.

app.use('/api/auth',          authRoutes);
app.use('/api/tasks',         taskRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/withdrawals',   withdrawalRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/kyc',           kycRoutes);
app.use('/api/contact',       contactRoutes);
app.use('/api/coins',         coinsRoutes);
app.use('/api/push',          pushRoutes);
app.use('/api/quiz',          quizRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const appErr = err as AppError;
  const status  = appErr.statusCode || 500;
  // In development, expose the real error message so DB/query errors are visible
  const message = appErr.statusCode
    ? appErr.message
    : (process.env.NODE_ENV === 'development' ? err.message : 'Internal server error');

  if (!appErr.statusCode) {
    logger.error({ err: err.message, path: req.path, method: req.method }, 'Unhandled error');
  }

  res.status(status).json({
    success: false,
    error:   message,
    ...(appErr.code ? { code: appErr.code } : {}),
  });
});

async function runDiagnostics(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;
  try {
    // 1. Check critical tables exist
    const tablesRes = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const tables = tablesRes.rows.map((r) => r.tablename);
    logger.info({ tables }, '📋 DB tables');

    // 2. Check task_completions columns
    if (tables.includes('task_completions')) {
      const colRes = await pool.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'task_completions'
         ORDER BY ordinal_position`,
      );
      const cols = colRes.rows.map((c) => `${c.column_name}(${c.data_type})`);
      logger.info({ cols }, '🗂  task_completions columns');
    } else {
      logger.warn({}, '⚠️  task_completions table MISSING — run docs/schema_current.sql');
    }

    // 3. Smoke-test the earnings query including ENUM filter casts
    await pool.query(
      `SELECT tc.id, t.title, t.type, tc.reward_earned, tc.status, tc.completed_at
       FROM task_completions tc
       JOIN tasks t ON t.id = tc.task_id
       WHERE tc.user_id = '00000000-0000-0000-0000-000000000000'
         AND ($1::text IS NULL OR tc.status = $1::completion_status)
         AND ($2::text IS NULL OR t.type    = $2::task_type)
       LIMIT 1`,
      [null, null],
    );
    logger.info({}, '✅ Earnings query OK');
  } catch (err) {
    logger.error({ err: (err as Error).message }, '❌ Diagnostics FAILED — see error above');
  }
}

// ─── KYC auto-approval scheduler ─────────────────────────────────────────────
// Any KYC submission that remains 'pending' for 32+ hours is auto-approved.
async function runKycAutoApproval(): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: string;
      user_id: string;
      id_type: string;
    }>(
      `UPDATE kyc_submissions
       SET status = 'approved', reviewed_at = NOW(), reviewed_by = NULL
       WHERE status = 'pending'
         AND submitted_at <= NOW() - INTERVAL '32 hours'
       RETURNING id, user_id, id_type`,
    );

    if (rows.length === 0) return;

    logger.info({ count: rows.length }, 'KYC auto-approval: approved submissions');

    for (const row of rows) {
      // Sync kyc_status on users table
      await pool.query(`UPDATE users SET kyc_status = 'approved' WHERE id = $1`, [row.user_id]);

      // Fetch user info for notifications
      const userRes = await pool.query<{ email: string; username: string }>(
        `SELECT email, username FROM users WHERE id = $1`,
        [row.user_id],
      );
      if (userRes.rows.length === 0) continue;

      const { email, username } = userRes.rows[0];
      const title = 'KYC Approved';
      const body  = 'Your identity has been verified. You can now request withdrawals.';

      void createNotification(row.user_id, 'kyc_approved', title, body, '/withdraw');
      void sendPushToUser(row.user_id, title, body, '/withdraw');
      void sendKycStatusEmail(email, username, 'approved');
    }
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'KYC auto-approval error');
  }
}

async function bootstrap() {
  logger.info({}, 'Connecting to PostgreSQL…');
  await connectDB();

  logger.info({}, 'Connecting to Redis…');
  await connectRedis();

  await runDiagnostics();

  // Start KYC auto-approval scheduler — runs every hour
  void runKycAutoApproval();
  setInterval(() => { void runKycAutoApproval(); }, 60 * 60 * 1000);

  // Reconcile pending PayMongo checkouts — runs every 2 minutes.
  // Catches payments whose webhook was missed or rejected so that
  // subscriptions are activated even if the user closed the browser.
  void reconcilePendingCheckouts();
  setInterval(() => { void reconcilePendingCheckouts(); }, 2 * 60 * 1000);

  // Promotions scheduler — runs every minute. Detects start/end transitions
  // for rows in the promotions table and fires the one-shot side effects
  // (announcement email + in-app notifications on start; stamp ended_at on
  // end). Restart-safe thanks to launched_at / ended_at stamps.
  void runPromotionsTick();
  setInterval(() => { void runPromotionsTick(); }, 60 * 1000);

  app.listen(PORT, () => {
    logger.info({ port: PORT }, `Plivio API running → http://localhost:${PORT}`);
  });
}

bootstrap().catch((err: Error) => {
  logger.error({ err: err.message, code: (err as NodeJS.ErrnoException).code }, 'Failed to start server');
  process.exit(1);
});
