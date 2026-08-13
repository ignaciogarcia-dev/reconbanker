import type pg from 'pg'
import type { ScrapeStage } from '../domain/scrapeStage.js'

export interface FailedRunListItem {
  runId: string
  startedAt: Date
  durationMs: number | null
  accountId: string
  bank: string | null
  scriptVersion: string | null
  failureType: string | null
  stopReason: string | null
  failingStage: string | null
}

export interface FailedRunFilter {
  accountId?: string
  /** Lower bound on started_at. */
  since?: Date
  stage?: ScrapeStage
  limit: number
}

export interface RunDetail {
  runId: string
  accountId: string
  bank: string | null
  scriptVersion: string | null
  status: string
  transactionsFound: number | null
  failureType: string | null
  stopReason: string | null
  errorMessage: string | null
  startedAt: Date
  finishedAt: Date | null
  durationMs: number | null
}

export interface RunStep {
  stepIndex: number
  step: string
  status: string
  failureType: string | null
  errorMessage: string | null
  stack: string | null
  url: string | null
  durationMs: number | null
  createdAt: Date
}

// The failing stage of a run: its last failed step. A run can fail at more than one stage
// (a poll fails, then the session is lost), and the last one is the one that ended it.
const FAILING_STAGE = `
  LEFT JOIN LATERAL (
    SELECT step FROM bank_scrape_steps
     WHERE run_id = r.id AND status = 'failed'
     ORDER BY step_index DESC
     LIMIT 1
  ) fs ON true`

const LIST_COLUMNS = `
  r.id, r.started_at, r.duration_ms, r.account_id, r.failure_type, r.stop_reason,
  a.bank, sc.version AS script_version, fs.step AS failing_stage`

/**
 * Read side of the failure tables. Nothing outside the integration tests had ever
 * SELECTed `bank_scrape_runs`, which is the reason it accumulated columns nobody wrote:
 * a record no one reads gets no feedback about being wrong.
 *
 * Separate from ScrapeRunRepository on purpose — that one is the write path used by the
 * scrape harness, and these queries exist only to serve the `pnpm failures` CLI.
 */
export class ScrapeFailureReadModel {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Failed runs, most recent first.
   *
   * One shape for all three filters. The stage filter is an EXISTS rather than a join to
   * the steps table: a join returns a row per matching step, so it needs a DISTINCT that
   * costs the ordering, and — verified with EXPLAIN ANALYZE over 20k runs — the planner
   * leads with the runs table either way.
   *
   * Plans confirmed against a seeded table rather than assumed:
   *   unfiltered / account / window -> Index Scan using idx_bank_scrape_runs_failed
   *   + stage                       -> same, plus a hashed subplan on
   *                                    idx_bank_scrape_steps_failed
   * The ORDER BY ... LIMIT lets the ordered partial index stop early instead of sorting
   * the whole failure history.
   */
  async listFailed(filter: FailedRunFilter): Promise<FailedRunListItem[]> {
    const { rows } = await this.pool.query(
      `SELECT ${LIST_COLUMNS}
         FROM bank_scrape_runs r
         LEFT JOIN accounts a ON a.id = r.account_id
         LEFT JOIN bank_scripts sc ON sc.id = r.script_id
         ${FAILING_STAGE}
        WHERE r.status = 'failed'
          AND ($1::uuid IS NULL OR r.account_id = $1)
          AND ($2::timestamptz IS NULL OR r.started_at >= $2)
          AND ($3::text IS NULL OR EXISTS (
                SELECT 1 FROM bank_scrape_steps st
                 WHERE st.run_id = r.id AND st.status = 'failed' AND st.step = $3))
        ORDER BY r.started_at DESC
        LIMIT $4`,
      [filter.accountId ?? null, filter.since ?? null, filter.stage ?? null, filter.limit]
    )

    return rows.map((r: any) => ({
      runId: r.id,
      startedAt: r.started_at,
      durationMs: r.duration_ms ?? null,
      accountId: r.account_id,
      bank: r.bank ?? null,
      scriptVersion: r.script_version ?? null,
      failureType: r.failure_type ?? null,
      stopReason: r.stop_reason ?? null,
      failingStage: r.failing_stage ?? null,
    }))
  }

  async findRun(runId: string): Promise<RunDetail | null> {
    const { rows } = await this.pool.query(
      `SELECT r.id, r.account_id, r.status, r.transactions_found, r.failure_type, r.stop_reason,
              r.error_message, r.started_at, r.finished_at, r.duration_ms,
              a.bank, sc.version AS script_version
         FROM bank_scrape_runs r
         LEFT JOIN accounts a ON a.id = r.account_id
         LEFT JOIN bank_scripts sc ON sc.id = r.script_id
        WHERE r.id = $1`,
      [runId]
    )
    const r = rows[0]
    if (!r) return null
    return {
      runId: r.id,
      accountId: r.account_id,
      bank: r.bank ?? null,
      scriptVersion: r.script_version ?? null,
      status: r.status,
      transactionsFound: r.transactions_found ?? null,
      failureType: r.failure_type ?? null,
      stopReason: r.stop_reason ?? null,
      errorMessage: r.error_message ?? null,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? null,
      durationMs: r.duration_ms ?? null,
    }
  }

  /** The run's stages in the order they happened — served by idx_bank_scrape_steps_run. */
  async listSteps(runId: string): Promise<RunStep[]> {
    const { rows } = await this.pool.query(
      `SELECT step_index, step, status, failure_type, error_message, stack, url, duration_ms, created_at
         FROM bank_scrape_steps
        WHERE run_id = $1
        ORDER BY step_index`,
      [runId]
    )
    return rows.map((r: any) => ({
      stepIndex: r.step_index,
      step: r.step,
      status: r.status,
      failureType: r.failure_type ?? null,
      errorMessage: r.error_message ?? null,
      stack: r.stack ?? null,
      url: r.url ?? null,
      durationMs: r.duration_ms ?? null,
      createdAt: r.created_at,
    }))
  }
}
