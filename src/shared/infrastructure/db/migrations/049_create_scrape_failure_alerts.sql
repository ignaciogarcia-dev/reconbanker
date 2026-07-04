-- Tracks consecutive scrape-failure streaks per account so the external Slack/webhook
-- alert fires only after a few failures in a row (not on every single failure) and a
-- recovery notice can be sent when the account comes back.
--
-- Two independent groups per account:
--   'connection' -> login_failed / navigation_failed
--   'scrape'     -> movements_fetch_failed / detail_extraction_failed / timeout / unknown
--
-- `alerted` stays true after the threshold alert is sent (silencing further alerts) until
-- a successful scrape clears the row; the prior `alerted` value is what decides whether a
-- recovery notice is owed. Failure state is intentionally NOT on `accounts` (migration 036
-- dropped that) — it never blocks scraping, it only drives notifications.
CREATE TABLE IF NOT EXISTS scrape_failure_alerts (
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  failure_group TEXT NOT NULL CHECK (failure_group IN ('connection', 'scrape')),
  streak        INT NOT NULL DEFAULT 0,
  alerted       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, failure_group)
);
