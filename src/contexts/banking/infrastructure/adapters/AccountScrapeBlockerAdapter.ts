import { IAccountScrapeBlocker } from '../../domain/ports/IAccountScrapeBlocker.js'
import { Executor } from '../Executor.js'

export class AccountScrapeBlockerAdapter implements IAccountScrapeBlocker {
  constructor(private readonly executor: Executor) {}

  async block(accountId: string, reason: string): Promise<void> {
    // Idempotent: only the first (root-cause) fatal reason is recorded; repeated
    // failures don't overwrite it.
    await this.executor.query(
      `UPDATE accounts
          SET scrape_blocked_at = now(), scrape_blocked_reason = $2
        WHERE id = $1 AND scrape_blocked_reason IS NULL`,
      [accountId, reason]
    )
  }
}
