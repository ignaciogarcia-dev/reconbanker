-- Remove the fatal scrape/session auto-block. Scrape failures are now only
-- logged (and recorded in bank_scrape_runs); they no longer block an account
-- from automatic triggers, so these columns are obsolete.
ALTER TABLE accounts
  DROP COLUMN IF EXISTS scrape_blocked_at,
  DROP COLUMN IF EXISTS scrape_blocked_reason;
