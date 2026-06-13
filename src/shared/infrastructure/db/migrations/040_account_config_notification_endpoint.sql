-- Per-account central notification endpoint, distinct from the transaction
-- webhook_url. The system POSTs status/assistance events here (account_id +
-- type + status). Each endpoint has its own auth and an event filter so it only
-- receives the event types it subscribes to. The token is encrypted at rest with
-- the same CredentialsCipher used for webhook_auth_token.
ALTER TABLE account_config
  ADD COLUMN IF NOT EXISTS notification_endpoint_url TEXT,
  ADD COLUMN IF NOT EXISTS notification_auth_type    TEXT
    CHECK (notification_auth_type IS NULL OR notification_auth_type IN ('bearer', 'api_key')),
  ADD COLUMN IF NOT EXISTS notification_auth_token   TEXT,
  -- JSON array of subscribed event types, e.g. ["assistance_required"].
  ADD COLUMN IF NOT EXISTS notification_events       JSONB;
