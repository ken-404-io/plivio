-- 014: Add admin audit log table and processed_by column on withdrawals

-- Track which admin processed each withdrawal
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES users(id);

-- Admin audit log for all admin actions
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           BIGSERIAL    PRIMARY KEY,
  admin_id     UUID         NOT NULL REFERENCES users(id),
  action       TEXT         NOT NULL,          -- e.g. 'withdrawal_approve', 'withdrawal_reject', 'withdrawal_batch_approve'
  target_type  TEXT         NOT NULL,          -- e.g. 'withdrawal', 'user', 'kyc'
  target_id    TEXT         NOT NULL,          -- the id of the affected record
  details      JSONB,                          -- extra context (amount, username, reason, etc.)
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_admin    ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target   ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON admin_audit_log(created_at DESC);
