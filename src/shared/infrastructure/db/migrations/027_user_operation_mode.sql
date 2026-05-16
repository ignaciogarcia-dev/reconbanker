ALTER TABLE users
  ADD COLUMN operation_mode TEXT NULL
    CHECK (operation_mode IN ('reconcile', 'passthrough'));

ALTER TABLE accounts
  ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_accounts_user_id ON accounts(user_id);

ALTER TABLE account_config DROP COLUMN mode;
