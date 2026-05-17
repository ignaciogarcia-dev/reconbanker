import {
  ConciliatedTransactionData,
  IConciliatedTransactionRepository,
  PrimaryMatchRef,
} from '../domain/IConciliatedTransactionRepository.js'
import { Executor } from './Executor.js'

export class ConciliatedTransactionRepository implements IConciliatedTransactionRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): ConciliatedTransactionRepository {
    return new ConciliatedTransactionRepository(tx)
  }

  async save(match: ConciliatedTransactionData): Promise<void> {
    await this.executor.query(
      `INSERT INTO conciliated_transactions
         (id, account_id, request_id, bank_transaction_id, matched_by, is_primary, matched_at, created_at, is_notified)
       VALUES ($1,$2,$3,$4,'engine',true,now(),now(),false)`,
      [match.id, match.accountId, match.requestId, match.bankTransactionId]
    )
  }

  async findPrimaryByRequest(requestId: string): Promise<PrimaryMatchRef | null> {
    const { rows } = await this.executor.query<{ id: string }>(
      `SELECT id FROM conciliated_transactions WHERE request_id = $1 AND is_primary = true`,
      [requestId]
    )
    return rows[0] ? { id: rows[0].id } : null
  }

  async markNotified(matchId: string): Promise<void> {
    await this.executor.query(
      `UPDATE conciliated_transactions SET is_notified = true WHERE id = $1`,
      [matchId]
    )
  }
}
