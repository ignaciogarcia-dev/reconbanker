CREATE TABLE IF NOT EXISTS account_config (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pending_orders_endpoint  TEXT NOT NULL,
  webhook_url              TEXT NOT NULL,
  retry_limit              INT NOT NULL DEFAULT 3,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  polling_method           TEXT NOT NULL DEFAULT 'GET' CHECK (polling_method IN ('GET', 'POST')),
  polling_body             JSONB,
  auth_type                TEXT NOT NULL DEFAULT 'bearer' CHECK (auth_type IN ('bearer', 'api_key')),
  auth_token               TEXT,
  CONSTRAINT uq_account_config UNIQUE (account_id)
);
