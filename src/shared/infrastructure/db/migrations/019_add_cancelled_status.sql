ALTER TABLE conciliation_requests
  DROP CONSTRAINT conciliation_requests_status_check;

ALTER TABLE conciliation_requests
  ADD CONSTRAINT conciliation_requests_status_check
  CHECK (status IN ('pending', 'processing', 'matched', 'not_found', 'ambiguous', 'failed', 'expired', 'cancelled'));
