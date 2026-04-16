-- Store the admin-supplied reason for banning or suspending an account.
-- Shown to the user on the login screen so they understand why access was revoked.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ban_reason     TEXT,
  ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
