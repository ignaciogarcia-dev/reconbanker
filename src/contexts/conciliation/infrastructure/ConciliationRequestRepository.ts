import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import {
  IConciliationRequestRepository,
  StaleRequestRef,
} from '../domain/IConciliationRequestRepository.js'
import { ConciliationRequestRowMapper, ConciliationRequestRow } from './mappers/ConciliationRequestRowMapper.js'
import { Executor } from './Executor.js'

export class ConciliationRequestRepository implements IConciliationRequestRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): ConciliationRequestRepository {
    return new ConciliationRequestRepository(tx)
  }

  async findById(id: string): Promise<ConciliationRequest | null> {
    const { rows } = await this.executor.query<ConciliationRequestRow>(
      `SELECT * FROM conciliation_requests WHERE id = $1`,
      [id]
    )
    return rows[0] ? ConciliationRequestRowMapper.toAggregate(rows[0]) : null
  }

  async findByIdForUpdate(id: string): Promise<ConciliationRequest | null> {
    const { rows } = await this.executor.query<ConciliationRequestRow>(
      `SELECT * FROM conciliation_requests WHERE id = $1 FOR UPDATE SKIP LOCKED`,
      [id]
    )
    return rows[0] ? ConciliationRequestRowMapper.toAggregate(rows[0]) : null
  }

  async findActiveExternalIds(accountId: string): Promise<Set<string>> {
    const { rows } = await this.executor.query<{ external_id: string }>(
      `SELECT external_id FROM conciliation_requests
        WHERE account_id = $1
          AND status NOT IN ('cancelled', 'expired')`,
      [accountId]
    )
    return new Set(rows.map((r) => r.external_id))
  }

  async findPendingByAccount(accountId: string): Promise<ConciliationRequest[]> {
    const { rows } = await this.executor.query<ConciliationRequestRow>(
      `SELECT * FROM conciliation_requests
        WHERE account_id = $1
          AND status IN ('pending', 'not_found')
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED`,
      [accountId]
    )
    return rows.map(ConciliationRequestRowMapper.toAggregate)
  }

  async findStale(olderThan: Date, limit = 500): Promise<StaleRequestRef[]> {
    const { rows } = await this.executor.query<{ id: string; account_id: string }>(
      `SELECT id, account_id FROM conciliation_requests
        WHERE status IN ('pending', 'not_found')
          AND created_at <= $1
        LIMIT $2`,
      [olderThan, limit]
    )
    return rows.map((r) => ({ id: r.id, accountId: r.account_id }))
  }

  async hasActiveRequests(accountId: string): Promise<boolean> {
    const { rows } = await this.executor.query(
      `SELECT 1 FROM conciliation_requests
        WHERE account_id = $1
          AND status IN ('pending', 'not_found')
        LIMIT 1`,
      [accountId]
    )
    return rows.length > 0
  }

  async cancelMissing(accountId: string, presentExternalIds: string[]): Promise<number> {
    const result = await this.executor.query(
      `UPDATE conciliation_requests
          SET status = 'cancelled'
        WHERE account_id = $1
          AND status IN ('pending', 'processing', 'not_found', 'ambiguous', 'failed')
          AND NOT (external_id = ANY($2::text[]))`,
      [accountId, presentExternalIds]
    )
    return result.rowCount ?? 0
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
