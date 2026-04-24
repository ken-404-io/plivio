-- ============================================================
-- PLIVIO — CURRENT FULL SCHEMA
-- Halvex Digital Inc.
-- ============================================================
-- This file represents the complete, up-to-date schema.
-- Use this for fresh deployments instead of running schema.sql
-- followed by all individual migration files.
--
-- After creating the schema, also run:
--   docs/seed.sql          (default tasks)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE plan_type         AS ENUM ('free', 'premium', 'elite');
CREATE TYPE task_type         AS ENUM ('captcha', 'video', 'ad_click', 'survey', 'referral');
CREATE TYPE completion_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE withdrawal_method AS ENUM ('gcash', 'paypal');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'paid', 'rejected');

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  username             VARCHAR(50)  UNIQUE NOT NULL,
  email                VARCHAR(255) UNIQUE NOT NULL,
  password_hash        TEXT,                          -- nullable: OAuth-only accounts have no password
  totp_secret          TEXT,
  plan                 plan_type    DEFAULT 'free',
  balance              NUMERIC(10,2) DEFAULT 0,
  referral_code        VARCHAR(12)  UNIQUE,
  referred_by          UUID         REFERENCES users(id),
  device_fingerprint   TEXT,
  device_name          TEXT,
  device_registered_at TIMESTAMPTZ,
  is_verified          BOOLEAN      DEFAULT FALSE,
  is_banned            BOOLEAN      DEFAULT FALSE,
  is_admin             BOOLEAN      DEFAULT FALSE,
  is_suspended         BOOLEAN      NOT NULL DEFAULT FALSE,
  suspended_until      TIMESTAMPTZ,
  ban_reason           TEXT,
  suspend_reason       TEXT,
  restoration_message  TEXT,
  is_email_verified    BOOLEAN      NOT NULL DEFAULT FALSE,
  kyc_status           TEXT         DEFAULT 'none',  -- none | pending | approved | rejected
  avatar_url           TEXT,
  -- OAuth provider IDs
  google_id            TEXT         UNIQUE,
  facebook_id          TEXT         UNIQUE,
  github_id            TEXT         UNIQUE,
  -- Plivio Coins & Daily Streak
  coins                NUMERIC(12,2) NOT NULL DEFAULT 0,
  streak_count         INTEGER      NOT NULL DEFAULT 0,
  last_streak_date     DATE,
  streak_broken_at     DATE,
  streak_before_break  INTEGER      NOT NULL DEFAULT 0,
  last_active_at       TIMESTAMPTZ,
  ad_block_status      VARCHAR(10)  DEFAULT NULL,
  created_at           TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_users_email         ON users(email);
CREATE INDEX idx_users_referral_code  ON users(referral_code);
CREATE INDEX idx_users_google_id      ON users(google_id)      WHERE google_id      IS NOT NULL;
CREATE INDEX idx_users_facebook_id    ON users(facebook_id)    WHERE facebook_id    IS NOT NULL;
CREATE INDEX idx_users_github_id      ON users(github_id)      WHERE github_id      IS NOT NULL;
CREATE INDEX idx_users_suspended      ON users(is_suspended)   WHERE is_suspended   = TRUE;
CREATE INDEX idx_users_last_active_at ON users(last_active_at DESC) WHERE last_active_at IS NOT NULL;

-- ─── Tasks ────────────────────────────────────────────────────────────────────

CREATE TABLE tasks (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               VARCHAR(255) NOT NULL,
  type                task_type    NOT NULL,
  reward_amount       NUMERIC(8,2) NOT NULL,
  min_plan            plan_type    DEFAULT 'free',
  is_active           BOOLEAN      DEFAULT TRUE,
  verification_config JSONB        NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── Task completions ─────────────────────────────────────────────────────────

CREATE TABLE task_completions (
  id            BIGSERIAL    PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id       UUID         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reward_earned NUMERIC(8,2),
  status        completion_status DEFAULT 'pending',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  proof         JSONB        NOT NULL DEFAULT '{}',
  server_data   JSONB        NOT NULL DEFAULT '{}'
);

-- Also store task type + title denormalised so earnings history survives task deletion
ALTER TABLE task_completions
  ADD COLUMN IF NOT EXISTS type  TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT;

CREATE INDEX idx_task_completions_user_id    ON task_completions(user_id);
CREATE INDEX idx_task_completions_completed_at ON task_completions(completed_at);
CREATE INDEX idx_task_completions_started_at ON task_completions(user_id, started_at);

-- ─── Withdrawals ──────────────────────────────────────────────────────────────

CREATE TABLE withdrawals (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount           NUMERIC(10,2) NOT NULL,
  method           withdrawal_method NOT NULL,
  status           withdrawal_status DEFAULT 'pending',
  account_name     TEXT,
  account_number   TEXT,
  rejection_reason TEXT,
  requested_at     TIMESTAMPTZ  DEFAULT NOW(),
  processed_at     TIMESTAMPTZ
);

CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);

-- ─── Subscriptions ────────────────────────────────────────────────────────────

CREATE TABLE subscriptions (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        plan_type    NOT NULL,
  starts_at   TIMESTAMPTZ  NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  is_active   BOOLEAN      DEFAULT TRUE
);

-- ─── Subscription checkouts (PayMongo) ───────────────────────────────────────

CREATE TABLE subscription_checkouts (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                 TEXT          NOT NULL,
  duration_days        INT           NOT NULL DEFAULT 30,
  amount_php           NUMERIC(10,2) NOT NULL,
  paymongo_ref         TEXT          UNIQUE,        -- PayMongo link ID (link_xxx)
  paymongo_payment_id  TEXT,                        -- PayMongo payment ID (pay_xxx)
  status               TEXT          NOT NULL DEFAULT 'pending', -- pending | paid | expired
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '2 hours'
);

CREATE INDEX idx_sc_user_id    ON subscription_checkouts(user_id);
CREATE INDEX idx_sc_paymongo   ON subscription_checkouts(paymongo_ref);
CREATE INDEX idx_sc_payment_id ON subscription_checkouts(paymongo_payment_id);
CREATE INDEX idx_sc_status     ON subscription_checkouts(status);

-- ─── Email verification tokens ────────────────────────────────────────────────

CREATE TABLE email_verification_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evt_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_evt_expires  ON email_verification_tokens(expires_at);

-- ─── Password reset tokens ────────────────────────────────────────────────────

CREATE TABLE password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prt_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_expires  ON password_reset_tokens(expires_at);

-- ─── Email change tokens ──────────────────────────────────────────────────────

CREATE TABLE email_change_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email  TEXT        NOT NULL,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ect_user    ON email_change_tokens(user_id);
CREATE INDEX idx_ect_expires ON email_change_tokens(expires_at);

-- ─── OAuth provider tokens ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_providers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT        NOT NULL,   -- google | facebook | github
  provider_id   TEXT        NOT NULL,
  access_token  TEXT,
  refresh_token TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_id)
);

-- ─── In-app notifications ─────────────────────────────────────────────────────

CREATE TABLE notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  link       TEXT,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC);

-- ─── KYC submissions ─────────────────────────────────────────────────────────

CREATE TABLE kyc_submissions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_type          TEXT        NOT NULL,   -- passport | national_id | drivers_license
  id_front_path    TEXT        NOT NULL,
  id_selfie_path   TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  rejection_reason TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID        REFERENCES users(id)
);

CREATE UNIQUE INDEX idx_kyc_user_pending ON kyc_submissions(user_id) WHERE status = 'pending';
CREATE INDEX        idx_kyc_status       ON kyc_submissions(status);

-- ─── Coin transactions ────────────────────────────────────────────────────────

CREATE TABLE coin_transactions (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT          NOT NULL, -- streak_bonus | streak_recovery | conversion | task_reward
  amount      NUMERIC(12,2) NOT NULL, -- positive = credit, negative = debit
  description TEXT          NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coin_tx_user ON coin_transactions(user_id, created_at DESC);

-- ─── Web push subscriptions ───────────────────────────────────────────────────

CREATE TABLE push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
