import { describe, expect, it, vi } from 'vitest'
import { ListBankMovementsUseCase } from './ListBankMovementsUseCase.js'

describe('ListBankMovementsUseCase', () => {
  it('delegates to the read model with the filter', async () => {
    const list = vi.fn().mockResolvedValue([{ id: 'tx-1' }])
    const uc = new ListBankMovementsUseCase({ list } as any)

    const out = await uc.execute({ accountId: 'acc-1', limit: 50 } as any)

    expect(list).toHaveBeenCalledWith({ accountId: 'acc-1', limit: 50 })
    expect(out).toEqual([{ id: 'tx-1' }])
  })

  it('returns whatever the read model returns', async () => {
    const list = vi.fn().mockResolvedValue([])
    const uc = new ListBankMovementsUseCase({ list } as any)

    expect(await uc.execute({} as any)).toEqual([])
  })
})
