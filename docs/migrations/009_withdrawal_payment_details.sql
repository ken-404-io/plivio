-- Migration 009: Add payment details and rejection reason to withdrawals
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS account_name   TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
