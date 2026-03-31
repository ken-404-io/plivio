-- Migration 004: OAuth provider support
-- Adds Google, Facebook, and GitHub social login columns.
-- password_hash is made nullable so OAuth-only accounts need no password.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id   TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id   TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_google_id   ON users(google_id)   WHERE google_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id) WHERE facebook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_github_id   ON users(github_id)   WHERE github_id   IS NOT NULL;
