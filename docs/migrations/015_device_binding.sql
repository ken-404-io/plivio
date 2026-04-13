-- Migration 015: Add device binding columns for one-user-one-device policy
-- device_name stores a human-readable device identifier (browser + OS)
-- device_registered_at tracks when the device was first bound

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_name          TEXT,
  ADD COLUMN IF NOT EXISTS device_registered_at TIMESTAMPTZ;

-- Backfill: set device_registered_at for users that already have a fingerprint
UPDATE users
  SET device_registered_at = created_at
  WHERE device_fingerprint IS NOT NULL AND device_registered_at IS NULL;
