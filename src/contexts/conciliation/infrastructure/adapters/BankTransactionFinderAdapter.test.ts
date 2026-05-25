import { describe, it, expect, vi } from 'vitest'
import { BankTransactionFinderAdapter } from './BankTransactionFinderAdapter.js'

describe('BankTransactionFinderAdapter', () => {
  describe('findCandidatesForAccount', () => {
    it('queries and maps rows', async () => {
      const receivedAt = new Date('2024-01-01T00:00:00Z')
      const rows = [
        {
          id: 'tx-1',
          amount: '123.45',
          currency: 'USD',
          sender_name: 'Alice',
          received_at: receivedAt,
        },
        {
          id: 'tx-2',
          amount: 50,
          currency: 'EUR',
          sender_name: null,
          received_at: receivedAt,
        },
      ]
      const pool = { query: vi.fn().mockResolvedValue({ rows }) }
      const repo = {} as any
      const adapter = new BankTransactionFinderAdapter(pool as any, repo)
      const out = await adapter.findCandidatesForAccount('acc-1')
      const [sql, params] = pool.query.mock.calls[0]
      expect(sql).toContain('FROM bank_transactions')
      expect(sql).toContain('account_id = $1')
      expect(sql).toContain('excluded_at IS NULL')
      expect(params).toEqual(['acc-1'])
      expect(out).toEqual([
        {
          id: 'tx-1',
          amount: 123.45,
          currency: 'USD',
          senderName: 'Alice',
          receivedAt,
        },
        {
          id: 'tx-2',
          amount: 50,
          currency: 'EUR',
          senderName: undefined,
          receivedAt,
        },
      ])
    })

    it('returns empty array when no rows', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
      const adapter = new BankTransactionFinderAdapter(pool as any, {} as any)
      expect(await adapter.findCandidatesForAccount('acc-1')).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns null when repo finds nothing', async () => {
      const repo = { findById: vi.fn().mockResolvedValue(null) }
      const adapter = new BankTransactionFinderAdapter({} as any, repo as any)
      expect(await adapter.findById('tx-1')).toBeNull()
      expect(repo.findById).toHaveBeenCalledWith('tx-1', undefined)
    })

    it('forwards opts and maps to view', async () => {
      const receivedAt = new Date('2024-01-01T00:00:00Z')
      const repo = {
        findById: vi.fn().mockResolvedValue({
          id: 'tx-1',
          accountId: 'acc-1',
          amount: 10,
          currency: 'USD',
          senderName: 'Alice',
          receivedAt,
          someOther: 'ignored',
        }),
      }
      const adapter = new BankTransactionFinderAdapter({} as any, repo as any)
      const out = await adapter.findById('tx-1', { forUpdate: true })
      expect(repo.findById).toHaveBeenCalledWith('tx-1', { forUpdate: true })
      expect(out).toEqual({
        id: 'tx-1',
        accountId: 'acc-1',
        amount: 10,
        currency: 'USD',
        senderName: 'Alice',
        receivedAt,
      })
    })
  })

  it('delegates isExcluded to the repo', async () => {
    const repo = { isExcluded: vi.fn().mockResolvedValue(true) }
    const adapter = new BankTransactionFinderAdapter({} as any, repo as any)
    expect(await adapter.isExcluded('tx-1')).toBe(true)
    expect(repo.isExcluded).toHaveBeenCalledWith('tx-1')
  })

  it('delegates markExcluded to the repo', async () => {
    const repo = { markExcluded: vi.fn().mockResolvedValue(undefined) }
    const adapter = new BankTransactionFinderAdapter({} as any, repo as any)
    await adapter.markExcluded('tx-1')
    expect(repo.markExcluded).toHaveBeenCalledWith('tx-1')
  })
})
