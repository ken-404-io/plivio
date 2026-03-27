import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { connectDB } from './config/db.js';
import { connectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { AppError } from './utils/errors.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { csrfMiddleware } from './middleware/csrf.js';

import authRoutes         from './routes/auth.js';
import taskRoutes         from './routes/tasks.js';
import userRoutes         from './routes/users.js';
import withdrawalRoutes   from './routes/withdrawals.js';
import subscriptionRoutes from './routes/subscriptions.js';
import adminRoutes        from './routes/admin.js';

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// ─── Security headers ────────────────────────────────────────────────────────
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

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
}));

// ─── Body & cookie parsing ───────────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(cookieParser());

// ─── Global rate limiter ─────────────────────────────────────────────────────
app.use(rateLimiter());

// ─── CSRF ────────────────────────────────────────────────────────────────────
app.use(csrfMiddleware);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── API routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/tasks',         taskRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/withdrawals',   withdrawalRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin',         adminRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status  = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Internal server error';

  if (!err.statusCode) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  }

  res.status(status).json({ success: false, error: message });
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap() {
  await connectDB();
  await connectRedis();
  app.listen(PORT, () => {
    logger.info({ port: PORT }, `Plivio API running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
