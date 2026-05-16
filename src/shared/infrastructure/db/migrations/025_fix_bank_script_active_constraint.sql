-- Enforce at most one active script per (bank, flow_type). The original
-- UNIQUE(bank, flow_type, status) only allowed one row per status value
-- (e.g. a single deprecated row), which breaks version history.
ALTER TABLE bank_scripts DROP CONSTRAINT IF EXISTS uq_bank_script_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_script_active
  ON bank_scripts (bank, flow_type)
  WHERE status = 'active';
