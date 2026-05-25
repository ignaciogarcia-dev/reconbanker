import { describe, it, expect, vi } from 'vitest'
import { AccountReaderAdapter } from './AccountReaderAdapter.js'

describe('AccountReaderAdapter', () => {
  it('returns null when accountRepo finds nothing', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null) }
    const adapter = new AccountReaderAdapter(repo as any)
    expect(await adapter.findById('acc-1')).toBeNull()
    expect(repo.findById).toHaveBeenCalledWith('acc-1')
  })

  it('maps Account to AccountSummary', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue({
        id: 'acc-1',
        userId: 'u-1',
        bank: 'banco-x',
        someOtherField: 'ignored',
      }),
    }
    const adapter = new AccountReaderAdapter(repo as any)
    expect(await adapter.findById('acc-1')).toEqual({ id: 'acc-1', userId: 'u-1' })
  })
})
