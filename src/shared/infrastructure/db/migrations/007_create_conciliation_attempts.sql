CREATE TABLE IF NOT EXISTS conciliation_attempts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_id             UUID NOT NULL REFERENCES conciliation_requests(id) ON DELETE CASCADE,
  attempt_number         INT NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('success', 'failed', 'ambiguous', 'no_match')),
  failure_type           TEXT CHECK (failure_type IN ('rule_miss', 'multiple_candidates', 'timeout', 'system_error')),
  error_message          TEXT,
  duration_ms            INT,
  matched_candidates     JSONB NOT NULL DEFAULT '[]',
  selected_transaction_id UUID REFERENCES bank_transactions(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- attempt_number secuencial por request
  CONSTRAINT uq_conciliation_attempt_number UNIQUE (request_id, attempt_number)
);
