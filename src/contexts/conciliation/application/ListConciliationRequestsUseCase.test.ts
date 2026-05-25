import { describe, it, expect, vi } from 'vitest'
import { ListConciliationRequestsUseCase } from './ListConciliationRequestsUseCase.js'

describe('ListConciliationRequestsUseCase', () => {
  it('delegates to readModel.list with the given filter', async () => {
    const fakeItems = [
      {
        id: 'r-1', accountId: 'a-1', externalId: 'ext-1', expectedAmount: 100,
        currency: 'USD', senderName: 'Alice', status: 'pending', retryCount: 0,
        lastCheckedAt: null, createdAt: new Date(), bank: 'BankX', accountName: 'Main',
      },
    ]
    const readModel = {
      list: vi.fn().mockResolvedValue(fakeItems),
      findDetailForUser: vi.fn(),
    }
    const useCase = new ListConciliationRequestsUseCase(readModel as any)

    const filter = { userId: 'u-1', status: 'pending', limit: 10, offset: 0 }
    const result = await useCase.execute(filter)

    expect(readModel.list).toHaveBeenCalledWith(filter)
    expect(result).toBe(fakeItems)
  })

  it('passes through an empty list', async () => {
    const readModel = {
      list: vi.fn().mockResolvedValue([]),
      findDetailForUser: vi.fn(),
    }
    const useCase = new ListConciliationRequestsUseCase(readModel as any)
    const result = await useCase.execute({ userId: 'u-1', limit: 5, offset: 0 })
    expect(result).toEqual([])
  })
})
