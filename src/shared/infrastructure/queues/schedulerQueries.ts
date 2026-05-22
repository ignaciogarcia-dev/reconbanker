// SQL for selecting accounts eligible for automatic scrape triggers.
// Extracted so the Scheduler and its integration test share the exact same
// gating logic — most importantly the `scrape_blocked_reason IS NULL` filter,
// which keeps fatally-blocked accounts (bad credentials) from being retried
// into a bank lockout. Keeping a single source of truth prevents the test from
// drifting away from the query the Scheduler actually runs.

// One-shot accounts: active, not blocked, session_type defaults to 'one-shot'
// when there is no config row.
export const SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL = `
  SELECT a.id
    FROM accounts a
    LEFT JOIN account_config ac ON ac.account_id = a.id
   WHERE a.status = 'active'
     AND a.scrape_blocked_reason IS NULL
     AND COALESCE(ac.session_type, 'one-shot') = 'one-shot'`

// Persistent-session candidates: active, not blocked, session_type = 'persistent'.
export const PERSISTENT_SESSION_CANDIDATES_SQL = `
  SELECT a.id
    FROM accounts a
    JOIN account_config ac ON ac.account_id = a.id
   WHERE a.status = 'active'
     AND a.scrape_blocked_reason IS NULL
     AND ac.session_type = 'persistent'`
