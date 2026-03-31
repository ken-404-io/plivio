-- Migration 003: Email verification, password reset, and subscription checkout tables

-- ─── Email verified flag on users ────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Email verification tokens ────────────────────────────────────────────────
-- Token is stored as SHA-256 hash. The raw token is only ever sent by email,
-- never stored in the database, so a DB leak cannot be used to verify emails.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evt_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_evt_expires  ON email_verification_tokens(expires_at);

-- ─── Password reset tokens ────────────────────────────────────────────────────
-- Same approach: only SHA-256 hash stored. Expires 15 minutes after creation.
-- Deleting a token on use prevents replay attacks.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_expires  ON password_reset_tokens(expires_at);

-- ─── Subscription checkout sessions (PayMongo) ───────────────────────────────
-- Tracks in-flight payment attempts. Webhook looks up by paymongo_ref to
-- activate the subscription after a successful payment.
CREATE TABLE IF NOT EXISTS subscription_checkouts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan            TEXT          NOT NULL,
  duration_days   INT           NOT NULL DEFAULT 30,
  amount_php      NUMERIC(10,2) NOT NULL,
  paymongo_ref    TEXT          UNIQUE,  -- PayMongo link ID
  status          TEXT          NOT NULL DEFAULT 'pending', -- pending | paid | expired
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW() + INTERVAL '2 hours'
);

CREATE INDEX IF NOT EXISTS idx_sc_user_id     ON subscription_checkouts(user_id);
CREATE INDEX IF NOT EXISTS idx_sc_paymongo    ON subscription_checkouts(paymongo_ref);
CREATE INDEX IF NOT EXISTS idx_sc_status      ON subscription_checkouts(status);
