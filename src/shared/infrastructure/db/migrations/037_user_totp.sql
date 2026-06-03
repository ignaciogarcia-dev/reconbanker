-- TOTP two-factor authentication for app users (opt-in).
-- totp_secret holds the Base32 secret, encrypted at rest with CredentialsCipher.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret       TEXT NULL,
  ADD COLUMN IF NOT EXISTS totp_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_confirmed_at TIMESTAMPTZ NULL;

-- One-time backup codes for recovery when the authenticator device is lost.
-- code_hash is a bcrypt hash; used_at marks single-use consumption.
CREATE TABLE IF NOT EXISTS user_backup_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user ON user_backup_codes(user_id);
