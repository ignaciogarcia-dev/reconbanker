-- Machine-to-machine API keys for the external /v1 API (e.g. an SMS server that
-- injects OTP codes). Distinct from user JWTs: long-lived, revocable, scoped.
-- The secret is shown once at creation and only its hash is stored here.
-- `scopes` gates actions (otp:write, status:read); `account_ids` optionally
-- restricts a key to specific accounts (NULL = all of the user's accounts).
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  hash         TEXT NOT NULL,
  scopes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  account_ids  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_prefix ON api_keys(prefix);
