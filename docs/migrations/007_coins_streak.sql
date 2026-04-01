-- ─── Migration 007: Plivio Coins + Daily Streak ──────────────────────────────

-- Add coins balance to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS coins              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_count       INTEGER        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_streak_date   DATE,
  ADD COLUMN IF NOT EXISTS streak_broken_at   DATE,
  ADD COLUMN IF NOT EXISTS streak_before_break INTEGER       NOT NULL DEFAULT 0;

-- Coin transactions ledger
CREATE TABLE IF NOT EXISTS coin_transactions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT         NOT NULL, -- 'streak_bonus' | 'streak_recovery' | 'conversion' | 'task_reward'
  amount      NUMERIC(12, 2) NOT NULL, -- positive = credit, negative = debit
  description TEXT         NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_tx_user ON coin_transactions(user_id, created_at DESC);
