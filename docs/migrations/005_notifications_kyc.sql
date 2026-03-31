-- Migration 005: Notifications, KYC, email change tokens

-- ─── In-app notifications ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL,
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  link       TEXT,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- ─── KYC (Know Your Customer) submissions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_type          TEXT        NOT NULL,   -- passport | national_id | drivers_license
  id_front_path    TEXT        NOT NULL,   -- server-side file path (never exposed directly)
  id_selfie_path   TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  rejection_reason TEXT,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID        REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_user_pending
  ON kyc_submissions(user_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions(status);

-- Add kyc_status convenience column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'none';
-- none | pending | approved | rejected
UPDATE users u SET kyc_status =
  COALESCE((SELECT status FROM kyc_submissions ks WHERE ks.user_id = u.id
            ORDER BY submitted_at DESC LIMIT 1), 'none');

-- ─── Email change tokens ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_change_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email  TEXT        NOT NULL,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ect_user ON email_change_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_ect_expires ON email_change_tokens(expires_at);

-- ─── Avatar URL on users ───────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
