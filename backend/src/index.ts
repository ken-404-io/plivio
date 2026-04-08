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
import { AVATARS_DIR } from './middleware/upload.ts';

import authRoutes         from './routes/auth.ts';
import taskRoutes         from './routes/tasks.ts';
import userRoutes         from './routes/users.ts';
import withdrawalRoutes   from './routes/withdrawals.ts';
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
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin:         process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  exposedHeaders: ['X-CSRF-Token'],
}));

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cookieParser());
app.use(rateLimiter());
app.use(csrfMiddleware);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Serve avatar images publicly (safe — files have random names, no directory listing)
app.use(
  '/uploads/avatars',
  express.static(AVATARS_DIR, { index: false, dotfiles: 'deny', maxAge: '7d' }),
);

app.use('/api/auth',          authRoutes);
app.use('/api/tasks',         taskRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/withdrawals',   withdrawalRoutes);
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

  res.status(status).json({ success: false, error: message });
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

async function bootstrap() {
  logger.info({}, 'Connecting to PostgreSQL…');
  await connectDB();

  logger.info({}, 'Connecting to Redis…');
  await connectRedis();

  await runDiagnostics();

  app.listen(PORT, () => {
    logger.info({ port: PORT }, `Plivio API running → http://localhost:${PORT}`);
  });
}

bootstrap().catch((err: Error) => {
  logger.error({ err: err.message, code: (err as NodeJS.ErrnoException).code }, 'Failed to start server');
  process.exit(1);
});
