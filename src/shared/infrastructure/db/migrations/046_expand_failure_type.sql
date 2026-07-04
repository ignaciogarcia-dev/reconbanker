-- Expand the bank_scrape_runs.failure_type CHECK to the categories the bank scripts
-- already emit (login_failed/navigation_failed/movements_fetch_failed/detail_extraction_failed),
-- so RunBankScrapeUseCase can persist the real category instead of bucketing everything as 'unknown'.
-- Additive (superset of the old set); existing 'unknown' rows validate without a rewrite.
ALTER TABLE bank_scrape_runs DROP CONSTRAINT IF EXISTS bank_scrape_runs_failure_type_check;

ALTER TABLE bank_scrape_runs ADD CONSTRAINT bank_scrape_runs_failure_type_check
  CHECK (failure_type IN (
    'timeout', 'selector_missing', 'login_failed', 'unknown',
    'navigation_failed', 'movements_fetch_failed', 'detail_extraction_failed'
  ));
