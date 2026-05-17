import { ConciliationAttemptData, IConciliationAttemptRepository } from '../domain/IConciliationAttemptRepository.js'
import { Executor } from './Executor.js'

export class ConciliationAttemptRepository implements IConciliationAttemptRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): ConciliationAttemptRepository {
    return new ConciliationAttemptRepository(tx)
  }

  async save(attempt: ConciliationAttemptData): Promise<void> {
    await this.executor.query(
      `INSERT INTO conciliation_attempts
         (id, account_id, request_id, attempt_number, status, failure_type, matched_candidates, selected_transaction_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [
        attempt.id,
        attempt.accountId,
        attempt.requestId,
        attempt.attemptNumber,
        attempt.status,
        attempt.failureType ?? null,
        JSON.stringify(attempt.candidateIds),
        attempt.selectedTransactionId ?? null,
      ]
    )
  }
}
