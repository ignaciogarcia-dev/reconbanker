import { describe, it, expect, vi } from 'vitest'
import { UserDataCleanerAdapter } from './UserDataCleanerAdapter.js'

describe('UserDataCleanerAdapter', () => {
  it('issues six scoped DELETEs with the userId in the right order', async () => {
    const tx = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
    const adapter = new UserDataCleanerAdapter()

    await adapter.wipeForUser(tx as any, 'u-1')

    expect(tx.query).toHaveBeenCalledTimes(6)
    const calls = tx.query.mock.calls
    expect(calls[0][0]).toContain('DELETE FROM webhook_dead_letters')
    expect(calls[0][0]).toContain('account_id IN (SELECT id FROM accounts WHERE user_id = $1)')
    expect(calls[0][1]).toEqual(['u-1'])

    expect(calls[1][0]).toContain('DELETE FROM webhook_notifications')
    expect(calls[1][1]).toEqual(['u-1'])

    expect(calls[2][0]).toContain('DELETE FROM conciliated_transactions')
    expect(calls[2][1]).toEqual(['u-1'])

    expect(calls[3][0]).toContain('DELETE FROM conciliation_attempts')
    expect(calls[3][1]).toEqual(['u-1'])

    expect(calls[4][0]).toContain('DELETE FROM conciliation_requests')
    expect(calls[4][1]).toEqual(['u-1'])

    expect(calls[5][0]).toContain('DELETE FROM bank_transactions')
    expect(calls[5][1]).toEqual(['u-1'])
  })
})
