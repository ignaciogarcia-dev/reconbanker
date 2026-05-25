import { describe, it, expect, vi } from 'vitest'
import { BankMovementReadModel } from './BankMovementReadModel.js'

describe('BankMovementReadModel.list', () => {
  it('maps populated and null-able fields', async () => {
    const receivedAt = new Date('2024-01-01T00:00:00Z')
    const notifiedAt = new Date('2024-01-02T00:00:00Z')
    const rows = [
      {
        id: 'tx-1', external_id: 'ext-1', amount: '100.5', currency: 'USD',
        sender_name: 'Alice', received_at: receivedAt,
        notified_at: notifiedAt, excluded_at: null,
      },
      {
        id: 'tx-2', external_id: 'ext-2', amount: 50, currency: 'EUR',
        sender_name: null, received_at: receivedAt,
        notified_at: null, excluded_at: null,
      },
    ]
    const pool = { query: vi.fn().mockResolvedValue({ rows }) } as any
    const rm = new BankMovementReadModel(pool)
    const out = await rm.list({ accountId: 'acc-1', limit: 50, offset: 0 })
    expect(out[0].senderName).toBe('Alice')
    expect(out[0].notifiedAt).toEqual(notifiedAt)
    expect(out[1].senderName).toBeNull()
    expect(out[1].notifiedAt).toBeNull()
  })
})
