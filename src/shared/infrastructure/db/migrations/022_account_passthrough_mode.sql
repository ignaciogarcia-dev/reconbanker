ALTER TABLE account_config
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'reconcile'
    CHECK (mode IN ('reconcile', 'passthrough'));

ALTER TABLE account_config
  ALTER COLUMN pending_orders_endpoint DROP NOT NULL;

ALTER TABLE bank_transactions
  ADD COLUMN notified_at TIMESTAMPTZ NULL;
