-- ============================================================
-- PLIVIO — NEON DB PATCH MIGRATION
-- Run this in Neon Console → SQL Editor if your DB was created
-- before schema_current.sql was fully applied.
-- All statements use IF NOT EXISTS / DO NOTHING so it is safe
-- to run multiple times.
-- ============================================================

-- ─── 1. Ensure ENUMs exist ────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM ('free', 'premium', 'elite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_type AS ENUM ('captcha', 'video', 'ad_click', 'survey', 'referral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE completion_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE withdrawal_method AS ENUM ('gcash', 'paypal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. withdrawals — add missing columns ─────────────────────────────────────

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS account_name     TEXT,
  ADD COLUMN IF NOT EXISTS account_number   TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS processed_at     TIMESTAMPTZ;

-- Fix status column type if it is TEXT instead of the ENUM
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'withdrawals' AND column_name = 'status'
      AND data_type = 'text'
  ) THEN
    -- Add a temp column, copy, drop old, rename
    ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS status_new withdrawal_status DEFAULT 'pending';
    UPDATE withdrawals SET status_new = status::withdrawal_status;
    ALTER TABLE withdrawals DROP COLUMN status;
    ALTER TABLE withdrawals RENAME COLUMN status_new TO status;
  END IF;
END $$;

-- ─── 3. task_completions — add denormalised type + title columns ──────────────

ALTER TABLE task_completions
  ADD COLUMN IF NOT EXISTS type  TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT;

-- ─── 4. users — ensure all columns exist ─────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan             plan_type    NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS balance          NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_count     INT           NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date DATE,
  ADD COLUMN IF NOT EXISTS kyc_status       TEXT          NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS is_banned        BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_admin         BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS avatar_url       TEXT,
  ADD COLUMN IF NOT EXISTS coins            INT           NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_code    TEXT          UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by      UUID          REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS totp_secret      TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled     BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS google_id        TEXT,
  ADD COLUMN IF NOT EXISTS facebook_id      TEXT,
  ADD COLUMN IF NOT EXISTS github_id        TEXT,
  ADD COLUMN IF NOT EXISTS email_verified   BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS daily_limit      NUMERIC(10,2);

-- ─── 5. Ensure remaining tables exist ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_providers (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT         NOT NULL,
  provider_id  TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT         NOT NULL,
  title      TEXT         NOT NULL,
  body       TEXT         NOT NULL,
  is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id            BIGSERIAL    PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_type       TEXT         NOT NULL,
  id_front_path TEXT         NOT NULL,
  id_back_path  TEXT,
  selfie_path   TEXT         NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  submitted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_user_pending ON kyc_submissions(user_id) WHERE status = 'pending';
CREATE INDEX        IF NOT EXISTS idx_kyc_status       ON kyc_submissions(status);

CREATE TABLE IF NOT EXISTS coin_transactions (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INT          NOT NULL,
  type        TEXT         NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coin_tx_user ON coin_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT         NOT NULL UNIQUE,
  p256dh     TEXT         NOT NULL,
  auth       TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS subscription_checkouts (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan          TEXT          NOT NULL,
  duration_days INT           NOT NULL DEFAULT 30,
  amount_php    NUMERIC(10,2) NOT NULL,
  paymongo_ref  TEXT          UNIQUE,
  status        TEXT          NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '2 hours'
);

-- ─── Done ─────────────────────────────────────────────────────────────────────
SELECT 'Migration complete — all missing columns and tables added.' AS result;
