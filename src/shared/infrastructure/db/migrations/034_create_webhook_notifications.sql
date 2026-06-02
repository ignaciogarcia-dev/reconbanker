-- Append-only audit log of every webhook delivery attempt, across all flows
-- (passthrough bank movements and conciliation). The business-state flags
-- (bank_transactions.notified_at, conciliated_transactions.is_notified) remain
-- the source of truth; this table is pure observability.
CREATE TABLE IF NOT EXISTS webhook_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject_type    TEXT NOT NULL CHECK (subject_type IN ('bank_transaction', 'conciliation_request')),
  subject_id      UUID NOT NULL,
  url             TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  response_status INTEGER,            -- null when no HTTP response was received (network error)
  response_body   JSONB,             -- response captured as JSON; null on transport failure
  error_message   TEXT,              -- non-null on failure
  attempt         INTEGER NOT NULL,  -- BullMQ attempt number (1-based)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_notifications_account_created
  ON webhook_notifications (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_notifications_subject
  ON webhook_notifications (subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_notifications_status
  ON webhook_notifications (response_status);
