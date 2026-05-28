CREATE TABLE IF NOT EXISTS bank_scrape_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES bank_scrape_runs(id) ON DELETE CASCADE,
  step         TEXT NOT NULL CHECK (step IN ('login', 'navigate', 'extract')),
  status       TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  failure_type TEXT,
  error_message TEXT,
  duration_ms  INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
