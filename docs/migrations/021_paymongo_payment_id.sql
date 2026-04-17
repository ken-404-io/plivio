-- Store the PayMongo payment ID (pay_xxx) on the checkout record.
-- paymongo_ref already holds the link ID (link_xxx); this new column
-- captures the individual payment object ID returned in webhook events
-- and link payment arrays, giving a complete audit trail.

ALTER TABLE subscription_checkouts
  ADD COLUMN IF NOT EXISTS paymongo_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sc_payment_id
  ON subscription_checkouts(paymongo_payment_id);
