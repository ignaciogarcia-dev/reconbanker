-- Fatal-block state for an account's scraping/session.
-- A non-null scrape_blocked_reason means a fatal failure (e.g. bad credentials)
-- has blocked the account from ALL automatic scrape/session triggers until an
-- operator manually restarts it. Separate from `status` (active/inactive = user
-- intent). Nullable, so every existing account starts unblocked.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS scrape_blocked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scrape_blocked_reason TEXT;
