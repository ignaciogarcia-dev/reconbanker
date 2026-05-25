import { describe, it, expect, vi } from 'vitest'
import { AccountScrapeBlockerAdapter } from './AccountScrapeBlockerAdapter.js'

describe('AccountScrapeBlockerAdapter', () => {
  it('issues an idempotent UPDATE with accountId and reason', async () => {
    const executor = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) }
    const adapter = new AccountScrapeBlockerAdapter(executor as any)

    await adapter.block('acc-1', 'auth-failed')

    expect(executor.query).toHaveBeenCalledTimes(1)
    const [sql, params] = executor.query.mock.calls[0]
    expect(sql).toContain('UPDATE accounts')
    expect(sql).toContain('scrape_blocked_at = now()')
    expect(sql).toContain('scrape_blocked_reason = $2')
    expect(sql).toContain('WHERE id = $1 AND scrape_blocked_reason IS NULL')
    expect(params).toEqual(['acc-1', 'auth-failed'])
  })
})
