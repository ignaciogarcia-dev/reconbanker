import { PoolClient } from 'pg'
import { db } from '../../../shared/infrastructure/db/client.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import { IConciliationRequestRepository } from '../domain/IConciliationRequestRepository.js'

function reconstitute(row: any): ConciliationRequest {
  return ConciliationRequest.reconstitute(row.id, {
    accountId: row.account_id,
    externalId: row.external_id,
    expectedAmount: Number(row.expected_amount),
    currency: row.currency,
    senderName: row.sender_name ?? undefined,
    status: row.status,
    idempotencyKey: row.idempotency_key ?? undefined,
    retryCount: row.retry_count,
    lastCheckedAt: row.last_checked_at ?? undefined,
    createdAt: row.created_at,
  })
}

export class ConciliationRequestRepository implements IConciliationRequestRepository {
  constructor(private readonly client?: PoolClient) {}

  private get executor() {
    return this.client ?? db
  }

  async findById(id: string): Promise<ConciliationRequest | null> {
    const { rows } = await this.executor.query(
      `SELECT * FROM conciliation_requests WHERE id = $1 FOR UPDATE SKIP LOCKED`,
      [id]
    )
    if (!rows[0]) return null
    return reconstitute(rows[0])
  }

  async cancelMissing(accountId: string, presentExternalIds: string[]): Promise<number> {
    const { rowCount } = await this.executor.query(
      `UPDATE conciliation_requests
         SET status = 'cancelled'
       WHERE account_id = $1
         AND status IN ('pending', 'processing', 'not_found', 'ambiguous', 'failed')
         AND NOT (external_id = ANY($2::text[]))`,
      [accountId, presentExternalIds]
    )
    return rowCount ?? 0
  }

  async save(request: ConciliationRequest): Promise<void> {
    await this.executor.query(
      `INSERT INTO conciliation_requests
         (id, account_id, external_id, expected_amount, currency, sender_name, status, idempotency_key, retry_count, last_checked_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         retry_count = EXCLUDED.retry_count,
         last_checked_at = EXCLUDED.last_checked_at`,
      [
        request.id,
        request.accountId,
        request.externalId,
        request.expectedAmount,
        request.currency,
        request.senderName ?? null,
        request.status,
        request.idempotencyKey ?? null,
        request.retryCount,
        request.lastCheckedAt ?? null,
        request.createdAt,
      ]
    )
  }

}
