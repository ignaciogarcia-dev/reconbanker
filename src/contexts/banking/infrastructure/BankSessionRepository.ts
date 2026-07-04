import { IBankSessionRepository } from '../domain/IBankSessionRepository.js'
import { Executor } from './Executor.js'

export class BankSessionRepository implements IBankSessionRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): BankSessionRepository {
    return new BankSessionRepository(tx)
  }

  async markRunning(accountId: string): Promise<string | null> {
    const result = await this.executor.query(
      `WITH prev AS (SELECT status FROM bank_sessions WHERE account_id = $1)
       INSERT INTO bank_sessions (id, account_id, status, started_at, stopped_at, stop_reason)
       VALUES (gen_random_uuid(), $1, 'running', now(), NULL, NULL)
       ON CONFLICT (account_id) DO UPDATE SET
         status = 'running', started_at = now(), stopped_at = NULL, stop_reason = NULL
       RETURNING (SELECT status FROM prev) AS previous_status`,
      [accountId]
    )
    return result.rows[0]?.previous_status ?? null
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

  async markNeedsAttention(accountId: string, reason: string): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_sessions (id, account_id, status, stop_reason, stopped_at)
       VALUES (gen_random_uuid(), $1, 'needs_attention', $2, now())
       ON CONFLICT (account_id) DO UPDATE SET
         status = 'needs_attention', stop_reason = $2, stopped_at = now()`,
      [accountId, reason]
    )
  }

  async markAllRunningStopped(reason: string): Promise<number> {
    const result = await this.executor.query(
      `UPDATE bank_sessions SET status = 'stopped', stop_reason = $1, stopped_at = now()
        WHERE status = 'running'`,
      [reason]
    )
    return result.rowCount ?? 0
  }
}
