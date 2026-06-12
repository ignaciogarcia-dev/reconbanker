-- Durable state for "assistance required" during a scrape, e.g. an OTP/SMS code
-- the bank login is waiting on. The UI (alert + modal) and the per-account
-- notifier read from here. The actual code is NEVER stored here: it transits a
-- short-lived Redis stream (otp:req:<id>) only. One pending request per account.
CREATE TABLE IF NOT EXISTS assistance_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  session_id   UUID,
  type         TEXT NOT NULL DEFAULT 'otp' CHECK (type IN ('otp')),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'fulfilled', 'expired', 'cancelled')),
  -- { "length": 6, "type": "numeric", "purpose": "login" }
  descriptor   JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ
);

-- At most one pending assistance request per account.
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistance_pending_account
  ON assistance_requests(account_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_assistance_requests_account_status
  ON assistance_requests(account_id, status);
