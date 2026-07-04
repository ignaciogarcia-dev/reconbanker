import { describe, it, expect, vi } from 'vitest'
import { ReactivateSessionUseCase } from './ReactivateSessionUseCase.js'
import type { AccountForBanking, IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'
import { NotFoundError, ValidationError } from '../../../shared/errors/index.js'

const reader = (account: AccountForBanking | null): IAccountForBankingReader => ({
  findById: vi.fn().mockResolvedValue(account),
})

const assisted: AccountForBanking = {
  id: 'acc-1', userId: 'u-1', bank: 'bancopichincha', sessionType: 'persistent', loginMode: 'assisted',
}

describe('ReactivateSessionUseCase', () => {
  it('starts the session directly for an assisted persistent account', async () => {
    const start = vi.fn()
    const uc = new ReactivateSessionUseCase(reader(assisted), start)

    const result = await uc.execute('acc-1')

    expect(start).toHaveBeenCalledWith('acc-1')
    expect(result).toEqual({ started: true })
  })

  it('throws NotFoundError when the account does not exist', async () => {
    const start = vi.fn()
    const uc = new ReactivateSessionUseCase(reader(null), start)

    await expect(uc.execute('acc-x')).rejects.toBeInstanceOf(NotFoundError)
    expect(start).not.toHaveBeenCalled()
  })

  it('rejects a non-assisted persistent account', async () => {
    const start = vi.fn()
    const uc = new ReactivateSessionUseCase(reader({ ...assisted, loginMode: 'simple' }), start)

    await expect(uc.execute('acc-1')).rejects.toBeInstanceOf(ValidationError)
    expect(start).not.toHaveBeenCalled()
  })

  it('rejects an assisted one-shot account', async () => {
    const start = vi.fn()
    const uc = new ReactivateSessionUseCase(reader({ ...assisted, sessionType: 'one-shot' }), start)

    await expect(uc.execute('acc-1')).rejects.toBeInstanceOf(ValidationError)
    expect(start).not.toHaveBeenCalled()
  })
})
