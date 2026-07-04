import { FailureGroup, IScrapeFailureAlertStore } from '../domain/ports/IScrapeFailureAlertStore.js'
import { Executor } from './Executor.js'

interface AlertRow { streak: number; alerted: boolean }

export class ScrapeFailureAlertRepository implements IScrapeFailureAlertStore {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): ScrapeFailureAlertRepository {
    return new ScrapeFailureAlertRepository(tx)
  }

  async recordFailure(accountId: string, group: FailureGroup): Promise<{ streak: number; alerted: boolean }> {
    const { rows } = await this.executor.query<AlertRow>(
      `INSERT INTO scrape_failure_alerts (account_id, failure_group, streak, alerted, updated_at)
       VALUES ($1, $2, 1, false, now())
       ON CONFLICT (account_id, failure_group)
       DO UPDATE SET streak = scrape_failure_alerts.streak + 1, updated_at = now()
       RETURNING streak, alerted`,
      [accountId, group]
    )
    return { streak: rows[0].streak, alerted: rows[0].alerted }
  }

  async markAlerted(accountId: string, group: FailureGroup): Promise<void> {
    await this.executor.query(
      `UPDATE scrape_failure_alerts SET alerted = true, updated_at = now()
       WHERE account_id = $1 AND failure_group = $2`,
      [accountId, group]
    )
  }

  async clear(accountId: string, group: FailureGroup): Promise<{ wasAlerted: boolean }> {
    // CTE captures the prior `alerted` (RETURNING would otherwise give the post-update false);
    // no row (account never failed in this group) yields no rows → nothing was alerted.
    const { rows } = await this.executor.query<{ was_alerted: boolean }>(
      `WITH prev AS (
         SELECT alerted FROM scrape_failure_alerts
         WHERE account_id = $1 AND failure_group = $2
       )
       UPDATE scrape_failure_alerts s
          SET streak = 0, alerted = false, updated_at = now()
         FROM prev
        WHERE s.account_id = $1 AND s.failure_group = $2
       RETURNING prev.alerted AS was_alerted`,
      [accountId, group]
    )
    return { wasAlerted: rows[0]?.was_alerted === true }
  }
}
