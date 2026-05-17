import type pg from 'pg'
import { IConciliationOwnershipChecker } from '../../domain/ports/IConciliationOwnershipChecker.js'

export class ConciliationOwnershipCheckerAdapter implements IConciliationOwnershipChecker {
  constructor(private readonly pool: pg.Pool) {}

  async ownsRequest(requestId: string, userId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM conciliation_requests cr
         JOIN accounts a ON a.id = cr.account_id
        WHERE cr.id = $1 AND a.user_id = $2`,
      [requestId, userId]
    )
    return rows.length > 0
  }

  async ownsAccount(accountId: string, userId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM accounts WHERE id = $1 AND user_id = $2`,
      [accountId, userId]
    )
    return rows.length > 0
  }
}
