ALTER TABLE users
  ADD COLUMN IF NOT EXISTS operation_mode TEXT NULL
    CHECK (operation_mode IN ('reconcile', 'passthrough'));

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

ALTER TABLE account_config DROP COLUMN IF EXISTS mode;
