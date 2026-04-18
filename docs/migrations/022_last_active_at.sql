-- Migration 022: Add last_active_at for online presence tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users (last_active_at DESC)
  WHERE last_active_at IS NOT NULL;
