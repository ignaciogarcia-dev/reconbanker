import { describe, it, expect, vi } from 'vitest'
import { ConciliationOwnershipCheckerAdapter } from './ConciliationOwnershipCheckerAdapter.js'

describe('ConciliationOwnershipCheckerAdapter', () => {
  describe('ownsRequest', () => {
    it('returns true when rows are present', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) }
      const adapter = new ConciliationOwnershipCheckerAdapter(pool as any)
      expect(await adapter.ownsRequest('req-1', 'u-1')).toBe(true)
      const [sql, params] = pool.query.mock.calls[0]
      expect(sql).toContain('FROM conciliation_requests cr')
      expect(sql).toContain('JOIN accounts a')
      expect(sql).toContain('cr.id = $1')
      expect(sql).toContain('a.user_id = $2')
      expect(params).toEqual(['req-1', 'u-1'])
    })

    it('returns false when no rows', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
      const adapter = new ConciliationOwnershipCheckerAdapter(pool as any)
      expect(await adapter.ownsRequest('req-1', 'u-1')).toBe(false)
    })
  })

  describe('ownsAccount', () => {
    it('returns true when rows are present', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) }
      const adapter = new ConciliationOwnershipCheckerAdapter(pool as any)
      expect(await adapter.ownsAccount('acc-1', 'u-1')).toBe(true)
      const [sql, params] = pool.query.mock.calls[0]
      expect(sql).toContain('FROM accounts WHERE id = $1 AND user_id = $2')
      expect(params).toEqual(['acc-1', 'u-1'])
    })

    it('returns false when no rows', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) }
      const adapter = new ConciliationOwnershipCheckerAdapter(pool as any)
      expect(await adapter.ownsAccount('acc-1', 'u-1')).toBe(false)
    })
  })
})
