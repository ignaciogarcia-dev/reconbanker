import { ConciliationRequest, ConciliationStatus } from '../../domain/ConciliationRequest.js'

export interface ConciliationRequestRow {
  id: string
  account_id: string
  external_id: string
  expected_amount: string | number
  currency: string
  sender_name: string | null
  status: ConciliationStatus
  idempotency_key: string | null
  retry_count: number
  last_checked_at: Date | null
  created_at: Date
}

export const ConciliationRequestRowMapper = {
  toAggregate(row: ConciliationRequestRow): ConciliationRequest {
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
  },
}
