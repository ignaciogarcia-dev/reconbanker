-- Tracks the state of a persistent (long-lived) browser monitor session per account.
-- One row per account (latest state), upserted on session start/stop.
CREATE TABLE IF NOT EXISTS bank_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('running', 'stopped')),
  stop_reason TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at  TIMESTAMPTZ,
  CONSTRAINT uq_bank_session_account UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_sessions_status ON bank_sessions(status, account_id);
