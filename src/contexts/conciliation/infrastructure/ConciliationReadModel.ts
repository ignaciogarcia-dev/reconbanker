import type pg from 'pg'
import { IConciliationReadModel } from '../domain/ports/IConciliationReadModel.js'
import {
  ConciliationRequestListItemDto,
  ConciliationRequestDetailDto,
  ConciliationAttemptDto,
  ConciliationMatchDto,
  ListConciliationRequestsFilter,
} from '../application/dto/ConciliationRequestDto.js'

function mapListItem(row: any): ConciliationRequestListItemDto {
  return {
    id: row.id,
    accountId: row.account_id,
    externalId: row.external_id,
    expectedAmount: Number(row.expected_amount),
    currency: row.currency,
    senderName: row.sender_name ?? null,
    status: row.status,
    retryCount: row.retry_count,
    lastCheckedAt: row.last_checked_at ?? null,
    createdAt: row.created_at,
    bank: row.bank ?? null,
    accountName: row.account_name ?? null,
  }
}

export class ConciliationReadModel implements IConciliationReadModel {
  constructor(private readonly pool: pg.Pool) {}

  async list(filter: ListConciliationRequestsFilter): Promise<ConciliationRequestListItemDto[]> {
    const params: unknown[] = [filter.limit, filter.offset, filter.userId]
    let extra = ''
    if (filter.status) {
      params.push(filter.status)
      extra = `AND cr.status = $4`
    }
    const { rows } = await this.pool.query(
      `SELECT cr.*, a.bank, a.name AS account_name
         FROM conciliation_requests cr
         JOIN accounts a ON a.id = cr.account_id
        WHERE a.user_id = $3 ${extra}
        ORDER BY cr.created_at DESC
        LIMIT $1 OFFSET $2`,
      params
    )
    return rows.map(mapListItem)
  }

  async findDetailForUser(
    requestId: string,
    userId: string
  ): Promise<ConciliationRequestDetailDto | null> {
    const { rows: requestRows } = await this.pool.query(
      `SELECT cr.*, a.bank, a.name AS account_name
         FROM conciliation_requests cr
         JOIN accounts a ON a.id = cr.account_id
        WHERE cr.id = $1 AND a.user_id = $2`,
      [requestId, userId]
    )
    if (!requestRows[0]) return null
    const base = mapListItem(requestRows[0])

    const { rows: attemptRows } = await this.pool.query(
      `SELECT id, attempt_number, status, failure_type, matched_candidates,
              selected_transaction_id, created_at
         FROM conciliation_attempts
        WHERE request_id = $1
        ORDER BY attempt_number ASC`,
      [requestId]
    )
    const attempts: ConciliationAttemptDto[] = attemptRows.map((r: any) => ({
      id: r.id,
      attemptNumber: r.attempt_number,
      status: r.status,
      failureType: r.failure_type ?? null,
      candidateIds: typeof r.matched_candidates === 'string'
        ? JSON.parse(r.matched_candidates)
        : (r.matched_candidates ?? []),
      selectedTransactionId: r.selected_transaction_id ?? null,
      createdAt: r.created_at,
    }))

    const { rows: matchRows } = await this.pool.query(
      `SELECT ct.id, ct.bank_transaction_id, ct.is_primary, ct.is_notified, ct.matched_at,
              bt.amount, bt.currency, bt.sender_name, bt.received_at
         FROM conciliated_transactions ct
         JOIN bank_transactions bt ON bt.id = ct.bank_transaction_id
        WHERE ct.request_id = $1 AND ct.is_primary = true`,
      [requestId]
    )
    const match: ConciliationMatchDto | null = matchRows[0]
      ? {
          id: matchRows[0].id,
          bankTransactionId: matchRows[0].bank_transaction_id,
          amount: Number(matchRows[0].amount),
          currency: matchRows[0].currency,
          senderName: matchRows[0].sender_name ?? null,
          receivedAt: matchRows[0].received_at,
          isPrimary: matchRows[0].is_primary,
          isNotified: matchRows[0].is_notified,
          matchedAt: matchRows[0].matched_at,
        }
      : null

    return { ...base, attempts, match }
  }
}
