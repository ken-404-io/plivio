-- ============================================
-- PLIVIO DATABASE SCHEMA
-- Halvex Digital Inc.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMS
CREATE TYPE plan_type AS ENUM ('free', 'premium', 'elite');
CREATE TYPE task_type AS ENUM ('captcha', 'video', 'ad_click', 'survey', 'referral');
CREATE TYPE completion_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE withdrawal_method AS ENUM ('gcash', 'paypal');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'paid', 'rejected');

-- USERS
CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username           VARCHAR(50) UNIQUE NOT NULL,
  email              VARCHAR(255) UNIQUE NOT NULL,
  password_hash      TEXT NOT NULL,
  totp_secret        TEXT,
  plan               plan_type DEFAULT 'free',
  balance            NUMERIC(10,2) DEFAULT 0,
  referral_code      VARCHAR(12) UNIQUE,
  referred_by        UUID REFERENCES users(id),
  device_fingerprint TEXT,
  is_verified        BOOLEAN DEFAULT FALSE,
  is_banned          BOOLEAN DEFAULT FALSE,
  is_admin           BOOLEAN DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- TASKS
CREATE TABLE tasks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title          VARCHAR(255) NOT NULL,
  type           task_type NOT NULL,
  reward_amount  NUMERIC(8,2) NOT NULL,
  min_plan       plan_type DEFAULT 'free',
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- TASK COMPLETIONS
CREATE TABLE task_completions (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id        UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reward_earned  NUMERIC(8,2),
  status         completion_status DEFAULT 'pending',
  completed_at   TIMESTAMPTZ DEFAULT NOW()
);

-- WITHDRAWALS
CREATE TABLE withdrawals (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL,
  method        withdrawal_method NOT NULL,
  status        withdrawal_status DEFAULT 'pending',
  requested_at  TIMESTAMPTZ DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

-- SUBSCRIPTIONS
CREATE TABLE subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        plan_type NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE
);

-- INDEXES
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_referral_code ON users(referral_code);
CREATE INDEX idx_task_completions_user_id ON task_completions(user_id);
CREATE INDEX idx_task_completions_completed_at ON task_completions(completed_at);
CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);