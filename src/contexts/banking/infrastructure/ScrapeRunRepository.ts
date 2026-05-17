import { IScrapeRunRepository } from '../domain/IScrapeRunRepository.js'
import { Executor } from './Executor.js'

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

  async markSuccess(runId: string, transactionCount: number): Promise<void> {
    await this.executor.query(
      `UPDATE bank_scrape_runs SET status='success', transactions_found=$1, finished_at=now() WHERE id=$2`,
      [transactionCount, runId]
    )
  }

  async markFailed(runId: string, errorMessage: string): Promise<void> {
    await this.executor.query(
      `UPDATE bank_scrape_runs SET status='failed', failure_type='unknown', error_message=$1, finished_at=now() WHERE id=$2`,
      [errorMessage, runId]
    )
  }
}
