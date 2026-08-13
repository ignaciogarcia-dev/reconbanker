-- Failure diagnostics for bank scripts.
--
-- Expand-only, and every statement is independently idempotent: migrate.ts runs a
-- whole file in one db.query() with no transaction wrapper, so a file that fails
-- halfway leaves partial DDL and no ledger row.
--
-- bank_scrape_steps has never been written to (created in 010, no repository, no
-- entity, no type). It was shaped for a linear login -> navigate -> extract scrape;
-- the scripts in use today are long-lived monitors that authenticate once and poll
-- on a schedule. Widen it to match, and give it the fields a failure record needs.

-- Ordering and repetition: nothing today distinguishes poll cycle 1 from poll cycle
-- 147, and order was only inferable from created_at. One monotonic counter per run
-- covers both. ("sequence" is a SQL keyword; step_index avoids the ambiguity.)
ALTER TABLE bank_scrape_steps ADD COLUMN IF NOT EXISTS step_index INT NOT NULL DEFAULT 0;
ALTER TABLE bank_scrape_steps ADD COLUMN IF NOT EXISTS stack TEXT;
ALTER TABLE bank_scrape_steps ADD COLUMN IF NOT EXISTS url TEXT;

-- The eleven stages the harness can actually observe. navigate / movements_fetch /
-- detail_extraction mirror the failure_type values of the same names so a stage and
-- its failure describe the same event.
--
-- This NARROWS the old set: 'extract' is gone, split into the two phases that
-- actually exist (movements_fetch, detail_extraction). ADD CONSTRAINT validates
-- existing rows, so a narrowing change would normally abort the file mid-way — safe
-- here only because this table has never been written to. It was created in 010 with
-- no repository, entity, or type, and the only runtime SQL that has ever named it is
-- the test-suite TRUNCATE. Every environment's copy is empty, so there is nothing to
-- validate. Do not copy this pattern onto a table that holds rows.
ALTER TABLE bank_scrape_steps DROP CONSTRAINT IF EXISTS bank_scrape_steps_step_check;
ALTER TABLE bank_scrape_steps ADD CONSTRAINT bank_scrape_steps_step_check
  CHECK (step IN (
    'launch', 'load_script', 'credentials', 'login', 'auth_wait', 'poll',
    'keep_alive', 'navigate', 'movements_fetch', 'detail_extraction', 'close'
  ));

-- 'started' is what makes a hang representable: the previous set was terminal-only,
-- so a stage that never finished had no state and simply wrote no row.
ALTER TABLE bank_scrape_steps DROP CONSTRAINT IF EXISTS bank_scrape_steps_status_check;
ALTER TABLE bank_scrape_steps ADD CONSTRAINT bank_scrape_steps_status_check
  CHECK (status IN ('started', 'success', 'failed'));

-- Carries the MonitorStopReason for persistent sessions and the harness stop cause
-- for one-shot runs. Left unconstrained, matching bank_sessions.stop_reason.
ALTER TABLE bank_scrape_runs ADD COLUMN IF NOT EXISTS stop_reason TEXT;

-- Adds the monitor stop reasons that are genuine failures, the harness failure
-- causes, and 'orphaned' for runs invalidated by a restart. 'selector_missing' is
-- dead (emitted by nothing) but kept rather than spend a migration removing it.
ALTER TABLE bank_scrape_runs DROP CONSTRAINT IF EXISTS bank_scrape_runs_failure_type_check;
ALTER TABLE bank_scrape_runs ADD CONSTRAINT bank_scrape_runs_failure_type_check
  CHECK (failure_type IN (
    'timeout', 'selector_missing', 'login_failed', 'unknown',
    'navigation_failed', 'movements_fetch_failed', 'detail_extraction_failed',
    'auth_timeout', 'logged_out', 'watchdog_timeout', 'browser_closed',
    'session_killed', 'launch_failed', 'script_load_failed', 'credentials_failed',
    'orphaned'
  ));

-- Ordered retrieval, and the started -> terminal update lookup.
CREATE INDEX IF NOT EXISTS idx_bank_scrape_steps_run
  ON bank_scrape_steps(run_id, step_index);

-- "show me every run that failed at the login step".
CREATE INDEX IF NOT EXISTS idx_bank_scrape_steps_failed
  ON bank_scrape_steps(step, created_at DESC) WHERE status = 'failed';

-- The failure list view.
CREATE INDEX IF NOT EXISTS idx_bank_scrape_runs_failed
  ON bank_scrape_runs(started_at DESC) WHERE status = 'failed';
