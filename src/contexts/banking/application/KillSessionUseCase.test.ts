import { describe, it, expect, vi } from 'vitest'
import { KillSessionUseCase } from './KillSessionUseCase.js'
import type { AccountForBanking, IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'
import { NotFoundError } from '../../../shared/errors/index.js'

const reader = (account: AccountForBanking | null): IAccountForBankingReader => ({
  findById: vi.fn().mockResolvedValue(account),
})

const persistent: AccountForBanking = {
  id: 'acc-1', userId: 'u-1', bank: 'bancopichincha', sessionType: 'persistent', loginMode: 'assisted',
}

describe('KillSessionUseCase', () => {
  it('returns killed=true when a live session was terminated', async () => {
    const kill = vi.fn().mockReturnValue(true)
    const uc = new KillSessionUseCase(reader(persistent), kill)
    await expect(uc.execute('acc-1')).resolves.toEqual({ killed: true })
    expect(kill).toHaveBeenCalledWith('acc-1')
  })

  it('returns killed=false when no live session existed (idempotent no-op)', async () => {
    const uc = new KillSessionUseCase(reader(persistent), vi.fn().mockReturnValue(false))
    await expect(uc.execute('acc-1')).resolves.toEqual({ killed: false })
  })

  it('throws NotFoundError when the account does not exist', async () => {
    const kill = vi.fn()
    const uc = new KillSessionUseCase(reader(null), kill)
    await expect(uc.execute('acc-x')).rejects.toBeInstanceOf(NotFoundError)
    expect(kill).not.toHaveBeenCalled()
  })
})
