-- ============================================================
-- MIGRATION 002 – Task verification fields
-- Halvex Digital Inc.
-- Run ONCE after schema.sql + migration 001
-- ============================================================

-- Add verification configuration to tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS verification_config JSONB NOT NULL DEFAULT '{}';

-- Add server-side tracking columns to task_completions
ALTER TABLE task_completions
  ADD COLUMN IF NOT EXISTS started_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof       JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS server_data JSONB NOT NULL DEFAULT '{}';

-- Allow completed_at to be NULL for pending completions
-- (existing rows keep their value; new pending rows will have NULL)
ALTER TABLE task_completions
  ALTER COLUMN completed_at DROP DEFAULT;

-- Index for fast lookups of today's pending/approved completions
CREATE INDEX IF NOT EXISTS idx_task_completions_started_at
  ON task_completions(user_id, started_at);
