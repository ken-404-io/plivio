-- Add account suspension support (temporary ban with expiry)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

-- Index so auth checks resolve fast
CREATE INDEX IF NOT EXISTS idx_users_suspended ON users (is_suspended) WHERE is_suspended = TRUE;
