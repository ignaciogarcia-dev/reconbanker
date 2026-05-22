import { IBankSessionRepository } from '../domain/IBankSessionRepository.js'
import { Executor } from './Executor.js'

export class BankSessionRepository implements IBankSessionRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): BankSessionRepository {
    return new BankSessionRepository(tx)
  }

  async markRunning(accountId: string): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_sessions (id, account_id, status, started_at, stopped_at, stop_reason)
       VALUES (gen_random_uuid(), $1, 'running', now(), NULL, NULL)
       ON CONFLICT (account_id) DO UPDATE SET
         status = 'running', started_at = now(), stopped_at = NULL, stop_reason = NULL`,
      [accountId]
    )
  }

  async markStopped(accountId: string, reason: string): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_sessions (id, account_id, status, stop_reason, stopped_at)
       VALUES (gen_random_uuid(), $1, 'stopped', $2, now())
       ON CONFLICT (account_id) DO UPDATE SET
         status = 'stopped', stop_reason = $2, stopped_at = now()`,
      [accountId, reason]
    )
  }
}
