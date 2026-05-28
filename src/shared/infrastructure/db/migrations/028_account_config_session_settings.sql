-- Per-account session behaviour for bank scraping.
--   session_type: 'one-shot' (open→scrape→close, periodic) | 'persistent' (long-lived monitor)
--   login_mode:   'simple'   (logs in unattended)          | 'assisted' (waits for human 2FA)
-- Defaults keep every existing account on the current one-shot/simple behaviour.
ALTER TABLE account_config
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'one-shot'
    CHECK (session_type IN ('one-shot', 'persistent')),
  ADD COLUMN IF NOT EXISTS login_mode TEXT NOT NULL DEFAULT 'simple'
    CHECK (login_mode IN ('simple', 'assisted'));
