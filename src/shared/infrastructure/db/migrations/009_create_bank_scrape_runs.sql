CREATE TABLE IF NOT EXISTS bank_scrape_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  script_id         UUID REFERENCES bank_scripts(id),
  status            TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  transactions_found INT,
  failure_type      TEXT CHECK (failure_type IN ('timeout', 'selector_missing', 'login_failed', 'unknown')),
  error_message     TEXT,
  duration_ms       INT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bank_scrape_runs_account
  ON bank_scrape_runs(account_id, started_at DESC);
