CREATE TABLE IF NOT EXISTS bank_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_id    TEXT NOT NULL,              -- id del banco
  reference_hash TEXT NOT NULL,              -- fallback deduplication
  amount         NUMERIC(18,2) NOT NULL,
  currency       TEXT NOT NULL,
  sender_name    TEXT,
  received_at    TIMESTAMPTZ NOT NULL,       -- timestamp del banco
  script_id      UUID REFERENCES bank_scripts(id),
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload    JSONB NOT NULL DEFAULT '{}',
  -- Deduplication: external_id único por cuenta
  CONSTRAINT uq_bank_transaction_external UNIQUE (account_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_received
  ON bank_transactions(account_id, received_at DESC);
