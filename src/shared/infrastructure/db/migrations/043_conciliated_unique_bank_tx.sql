-- Backstop for the conciliation double-match race: a single bank transaction
-- must be the primary match of at most one request. The existing constraints
-- only cover (request_id, bank_transaction_id) and (request_id, is_primary),
-- which still allowed the same transaction to be conciliated to two different
-- requests under concurrency. Application-level FOR UPDATE locking now closes
-- the window; this index makes the invariant enforceable by the database too.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conciliated_bank_tx_primary
  ON conciliated_transactions (bank_transaction_id)
  WHERE is_primary = true;
