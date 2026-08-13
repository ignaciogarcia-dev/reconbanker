import { IScrapeRunRepository } from '../domain/IScrapeRunRepository.js'
import { Executor } from './Executor.js'

// started_at is already on the row, so the database is the only thing that needs a
// clock. Shared by every statement that closes a run.
const DURATION_MS = `GREATEST(0, (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int)`

export class ScrapeRunRepository implements IScrapeRunRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): ScrapeRunRepository {
    return new ScrapeRunRepository(tx)
  }

  async create(runId: string, accountId: string, scriptId: string): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_scrape_runs (id, account_id, script_id, status, started_at)
       VALUES ($1,$2,$3,'running',now())`,
      [runId, accountId, scriptId]
    )
  }

  // duration_ms existed since 009 and was null on every row ever written.
  async markSuccess(runId: string, transactionCount: number, stopReason?: string): Promise<void> {
    await this.executor.query(
      `UPDATE bank_scrape_runs
          SET status='success', transactions_found=$1, stop_reason=$2, finished_at=now(),
              duration_ms=${DURATION_MS}
        WHERE id=$3`,
      [transactionCount, stopReason ?? null, runId]
    )
  }

  async markFailed(
    runId: string,
    errorMessage: string,
    failureType: string = 'unknown',
    stopReason?: string
  ): Promise<void> {
    await this.executor.query(
      `UPDATE bank_scrape_runs
          SET status='failed', failure_type=$1, error_message=$2, stop_reason=$3, finished_at=now(),
              duration_ms=${DURATION_MS}
        WHERE id=$4`,
      [failureType, errorMessage, stopReason ?? null, runId]
    )
  }

  // Age proves nothing here — a persistent session legitimately runs for days — so
  // this is deliberately unconditional and boot-only rather than a periodic sweep.
  async markOrphaned(): Promise<number> {
    const { rowCount } = await this.executor.query(
      `UPDATE bank_scrape_runs
          SET status='failed', failure_type='orphaned',
              error_message=COALESCE(error_message, 'run was still in progress when the process restarted'),
              finished_at=now(),
              duration_ms=${DURATION_MS}
        WHERE status='running'`
    )
    return rowCount ?? 0
  }
}
