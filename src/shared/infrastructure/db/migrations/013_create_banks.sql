-- Create banks table
CREATE TABLE IF NOT EXISTS banks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  login_url    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'onboarding', 'ready', 'failed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill: one bank per unique bank code in accounts
INSERT INTO banks (id, code, name, status)
SELECT gen_random_uuid(), a.bank, a.bank, 'ready'
FROM (SELECT DISTINCT bank FROM accounts) a
ON CONFLICT (code) DO NOTHING;

-- Backfill from bank_scripts too
INSERT INTO banks (id, code, name, status)
SELECT gen_random_uuid(), bs.bank, bs.bank, 'ready'
FROM (SELECT DISTINCT bank FROM bank_scripts) bs
ON CONFLICT (code) DO NOTHING;

-- Add bank_id to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS bank_id UUID REFERENCES banks(id);
UPDATE accounts SET bank_id = banks.id FROM banks WHERE banks.code = accounts.bank;
ALTER TABLE accounts ALTER COLUMN bank_id SET NOT NULL;

-- Add bank_id to bank_scripts
ALTER TABLE bank_scripts ADD COLUMN IF NOT EXISTS bank_id UUID REFERENCES banks(id);
UPDATE bank_scripts SET bank_id = banks.id FROM banks WHERE banks.code = bank_scripts.bank;
ALTER TABLE bank_scripts ALTER COLUMN bank_id SET NOT NULL;
