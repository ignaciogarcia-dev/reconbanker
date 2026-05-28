CREATE TABLE IF NOT EXISTS bank_scripts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank          TEXT NOT NULL,
  flow_type     TEXT NOT NULL CHECK (flow_type IN ('login', 'extract_transactions', 'verify_payment')),
  version       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft', 'testing', 'review', 'active', 'deprecated', 'failed')),
  origin        TEXT NOT NULL CHECK (origin IN ('system', 'ai', 'user')),
  base_script_id UUID REFERENCES bank_scripts(id),
  code_snapshot TEXT,
  selector_map  JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Solo un script activo por banco+flow
  CONSTRAINT uq_bank_script_active UNIQUE NULLS NOT DISTINCT (bank, flow_type, status)
);
