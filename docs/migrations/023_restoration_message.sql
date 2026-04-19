-- Store admin's restoration note shown to user after unban/unsuspend
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS restoration_message TEXT;
