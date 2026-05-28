CREATE TABLE IF NOT EXISTS conciliated_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  request_id          UUID NOT NULL REFERENCES conciliation_requests(id) ON DELETE CASCADE,
  bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id),
  matched_by          TEXT NOT NULL,
  is_primary          BOOLEAN NOT NULL DEFAULT true,
  matched_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_notified         BOOLEAN NOT NULL DEFAULT false,
  -- Un match por request+transacción
  CONSTRAINT uq_conciliated_pair UNIQUE (request_id, bank_transaction_id),
  -- Solo un match primario por request
  CONSTRAINT uq_conciliated_primary UNIQUE NULLS NOT DISTINCT (request_id, is_primary)
);
