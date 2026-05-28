CREATE TABLE IF NOT EXISTS bank_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  username          TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  session_cookies   JSONB,
  status            TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'expired', 'invalid')),
  last_validated_at TIMESTAMPTZ,
  last_used_at      TIMESTAMPTZ,
  -- Una sola credencial por cuenta
  CONSTRAINT uq_bank_credentials_account UNIQUE (account_id)
);
