import { describe, it, expect, vi } from 'vitest'
import { AccountForBankingReaderAdapter } from './AccountForBankingReaderAdapter.js'

describe('AccountForBankingReaderAdapter', () => {
  it('returns null when account is not found', async () => {
    const accountRepo = { findById: vi.fn().mockResolvedValue(null) }
    const configRepo = { findByAccountId: vi.fn() }
    const adapter = new AccountForBankingReaderAdapter(accountRepo as any, configRepo as any)

    const result = await adapter.findById('acc-1')

    expect(result).toBeNull()
    expect(accountRepo.findById).toHaveBeenCalledWith('acc-1')
    expect(configRepo.findByAccountId).not.toHaveBeenCalled()
  })

  it('maps account + config to AccountForBanking', async () => {
    const accountRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'acc-1', userId: 'u-1', bank: 'banco-x' }),
    }
    const configRepo = {
      findByAccountId: vi.fn().mockResolvedValue({ sessionType: 'persistent', loginMode: 'mfa' }),
    }
    const adapter = new AccountForBankingReaderAdapter(accountRepo as any, configRepo as any)

    const result = await adapter.findById('acc-1')

    expect(result).toEqual({
      id: 'acc-1',
      userId: 'u-1',
      bank: 'banco-x',
      sessionType: 'persistent',
      loginMode: 'mfa',
    })
  })

  it('falls back to defaults when config is null', async () => {
    const accountRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'acc-1', userId: 'u-1', bank: 'banco-x' }),
    }
    const configRepo = { findByAccountId: vi.fn().mockResolvedValue(null) }
    const adapter = new AccountForBankingReaderAdapter(accountRepo as any, configRepo as any)

    expect(await adapter.findById('acc-1')).toEqual({
      id: 'acc-1',
      userId: 'u-1',
      bank: 'banco-x',
      sessionType: 'one-shot',
      loginMode: 'simple',
    })
  })

  it('falls back to defaults when config fields are undefined', async () => {
    const accountRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'acc-1', userId: 'u-1', bank: 'banco-x' }),
    }
    const configRepo = {
      findByAccountId: vi.fn().mockResolvedValue({ sessionType: undefined, loginMode: undefined }),
    }
    const adapter = new AccountForBankingReaderAdapter(accountRepo as any, configRepo as any)

    expect(await adapter.findById('acc-1')).toEqual({
      id: 'acc-1',
      userId: 'u-1',
      bank: 'banco-x',
      sessionType: 'one-shot',
      loginMode: 'simple',
    })
  })
})
