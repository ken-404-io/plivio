-- Migration 012: Subscriptions & PayMongo Checkouts

CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        VARCHAR(20) NOT NULL DEFAULT 'free',
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_user_id    ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_expires_at ON subscriptions(expires_at);

CREATE TABLE IF NOT EXISTS subscription_checkouts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan          VARCHAR(20) NOT NULL,
  duration_days INT         NOT NULL DEFAULT 30,
  amount_php    NUMERIC(8,2) NOT NULL,
  paymongo_ref  TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sc_user_id ON subscription_checkouts(user_id);
CREATE INDEX IF NOT EXISTS idx_sc_status  ON subscription_checkouts(status);
