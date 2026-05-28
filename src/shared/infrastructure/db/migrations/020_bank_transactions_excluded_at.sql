ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_active
  ON bank_transactions (account_id, received_at DESC)
  WHERE excluded_at IS NULL;

UPDATE bank_transactions bt
SET excluded_at = now()
WHERE bt.received_at < now() - interval '4 days'
  AND NOT EXISTS (
    SELECT 1 FROM conciliated_transactions ct
    WHERE ct.bank_transaction_id = bt.id
  );
