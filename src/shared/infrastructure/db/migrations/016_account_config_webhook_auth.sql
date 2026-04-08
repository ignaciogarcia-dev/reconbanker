ALTER TABLE account_config
  ADD COLUMN IF NOT EXISTS webhook_auth_type  TEXT CHECK (webhook_auth_type IN ('bearer', 'api_key')),
  ADD COLUMN IF NOT EXISTS webhook_auth_token TEXT;
