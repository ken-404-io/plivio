-- ─── Migration 016: Saved Payment Methods ─────────────────────────────────────
-- Lets users save GCash / PayPal accounts once, then pick one at withdrawal
-- time instead of re-typing the same details on every request.
--
-- Enforces that a single payment account (e.g. one GCash number, one PayPal
-- email) can only ever be linked to ONE user in the whole system.

CREATE TABLE IF NOT EXISTS payment_methods (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method          withdrawal_method NOT NULL,
  account_name    TEXT              NOT NULL,
  account_number  TEXT              NOT NULL,
  is_default      BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- A given (method, account_number) may only belong to ONE user, globally.
  -- This is the core "one user only" duplicate-prevention guarantee.
  CONSTRAINT payment_methods_method_account_unique
    UNIQUE (method, account_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user
  ON payment_methods(user_id);

-- Only one "default" payment method per user at a time. Enforced with a
-- partial unique index so we can have many non-default rows per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_one_default_per_user
  ON payment_methods(user_id)
  WHERE is_default = TRUE;
