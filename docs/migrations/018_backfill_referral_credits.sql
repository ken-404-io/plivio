-- Migration 018: Backfill uncredited referral bonuses
--
-- Context: emailAuthController used to credit referrals in batches of 10
-- (₱100 per batch) and credit AT MOST ONE batch per verification event.
-- If a referrer ever had multiple full batches' worth of verified invites,
-- only one batch would unlock per new verification — the rest stayed
-- permanently owed.
--
-- Going forward (emailAuthController change in the same commit) every
-- verified signup credits ₱10 immediately, no batch gate. This migration
-- reconciles the legacy state for existing users.
--
-- Per referrer:
--   expected_total   = ₱10 × verified_referrals_count
--   already_credited = ₱100 × users.referral_batches_credited
--   owed             = expected_total − already_credited
--
-- If owed > 0: add to balance, write one task_completion audit row.
--
-- Idempotency: we never re-pay a referrer who already has a
-- task_completion row tagged {migration: 018_backfill_referral_credits}.
-- The legacy referral_batches_credited column is intentionally left
-- untouched (it's no longer read by runtime code after this commit).

DO $$
DECLARE
  ref_task_id UUID;
BEGIN
  SELECT id INTO ref_task_id
  FROM tasks
  WHERE type = 'referral' AND is_active = TRUE
    AND (min_plan IS NULL OR min_plan = 'free')
  LIMIT 1;

  -- Bail out if there's no referral task — balance update without an audit
  -- row would leave no trail and break idempotency on re-run.
  IF ref_task_id IS NULL THEN
    RAISE NOTICE 'Migration 018 skipped: no active referral task row found.';
    RETURN;
  END IF;

  WITH owed AS (
    SELECT
      u.id AS user_id,
      ((SELECT COUNT(*)::int FROM users c
          WHERE c.referred_by = u.id AND c.is_email_verified = TRUE) * 10)
      - (u.referral_batches_credited * 100) AS owed_amount
    FROM users u
    WHERE NOT EXISTS (
      -- Skip referrers who have already been backfilled by a previous run.
      SELECT 1 FROM task_completions tc
      WHERE tc.user_id = u.id
        AND tc.server_data @> jsonb_build_object('migration', '018_backfill_referral_credits')
    )
  ),
  bumped AS (
    UPDATE users u
    SET balance = u.balance + o.owed_amount
    FROM owed o
    WHERE u.id = o.user_id AND o.owed_amount > 0
    RETURNING u.id AS user_id, o.owed_amount AS amount
  )
  INSERT INTO task_completions
    (user_id, task_id, type, status, reward_earned, completed_at, proof, server_data)
  SELECT
    b.user_id,
    ref_task_id,
    'referral',
    'approved',
    b.amount,
    NOW(),
    '{}'::jsonb,
    jsonb_build_object('migration', '018_backfill_referral_credits')
  FROM bumped b;
END $$;
