-- Migration 014: Add referral batch tracking to users
-- Each batch of 10 valid referrals credits ₱100 to the referrer's balance.
-- This column tracks how many batches have already been credited so we
-- never double-credit when re-running the batch logic.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_batches_credited INT NOT NULL DEFAULT 0;
