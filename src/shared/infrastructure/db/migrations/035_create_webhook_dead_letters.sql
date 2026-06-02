-- Durable record of webhook deliveries that exhausted all retry attempts.
-- One row per failed subject (bank movement or conciliation request); mutable
-- (resolved_at flips when a later re-drive succeeds). This is the queryable
-- answer to "which notifications were lost?" — the per-attempt detail lives in
-- webhook_notifications, the business-state flags remain the source of truth.
CREATE TABLE IF NOT EXISTS webhook_dead_letters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('bank_transaction', 'conciliation_request')),
  subject_id    UUID NOT NULL,
  url           TEXT,
  last_status   INTEGER,            -- null when no HTTP response was received (network error)
  last_error    TEXT,
  attempts      INTEGER NOT NULL,   -- total attempts made before exhaustion
  failed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ         -- null until an operator re-drive (or later retry) succeeds
);

-- One live dead-letter per subject: a repeated final failure of the same subject
-- updates the existing row in place rather than piling up duplicates. Resolving a
-- row frees the slot so a fresh failure can be recorded again.
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_dead_letters_subject_unresolved
  ON webhook_dead_letters (subject_type, subject_id) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_dead_letters_unresolved
  ON webhook_dead_letters (account_id, failed_at DESC) WHERE resolved_at IS NULL;
