-- TOTP replay protection: records the time step of the last successful 2FA
-- verification. verifyTwoFactorCode passes it to the provider as afterTimeStep
-- so a code cannot be reused within its validity window.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NULL;
