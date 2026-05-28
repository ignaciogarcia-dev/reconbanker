CREATE TABLE IF NOT EXISTS conciliation_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL,
  expected_amount NUMERIC(18,2) NOT NULL,
  currency        TEXT NOT NULL,
  sender_name     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'matched', 'not_found', 'ambiguous', 'failed')),
  idempotency_key TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- external_id único por cuenta
  CONSTRAINT uq_conciliation_request_external UNIQUE (account_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_conciliation_requests_pending
  ON conciliation_requests(account_id, status)
  WHERE status = 'pending';
