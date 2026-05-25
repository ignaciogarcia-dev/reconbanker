import { describe, expect, it } from 'vitest'
import {
  ConciliationRequestRowMapper,
  type ConciliationRequestRow,
} from './ConciliationRequestRowMapper.js'

describe('ConciliationRequestRowMapper', () => {
  const row: ConciliationRequestRow = {
    id: 'req-1',
    account_id: 'acc-1',
    external_id: 'ext-1',
    expected_amount: '500.00',
    currency: 'ARS',
    sender_name: 'Buyer',
    status: 'pending',
    idempotency_key: 'idem-1',
    retry_count: 2,
    last_checked_at: new Date('2024-01-01T01:00:00Z'),
    created_at: new Date('2024-01-01T00:00:00Z'),
  }

  it('parses numeric amount and keeps all fields', () => {
    const req = ConciliationRequestRowMapper.toAggregate(row)
    expect(req.id).toBe('req-1')
    expect(req.expectedAmount).toBe(500)
    expect(req.retryCount).toBe(2)
    expect(req.status).toBe('pending')
  })

  it('accepts numeric amount unchanged', () => {
    const req = ConciliationRequestRowMapper.toAggregate({ ...row, expected_amount: 250 })
    expect(req.expectedAmount).toBe(250)
  })

  it('drops nullable optional fields', () => {
    const req = ConciliationRequestRowMapper.toAggregate({
      ...row,
      sender_name: null,
      idempotency_key: null,
      last_checked_at: null,
    })
    expect(req.senderName).toBeUndefined()
    expect(req.idempotencyKey).toBeUndefined()
    expect(req.lastCheckedAt).toBeUndefined()
  })
})
