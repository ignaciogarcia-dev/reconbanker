import { describe, it, expect, vi } from 'vitest'
import { GetConciliationRequestDetailUseCase } from './GetConciliationRequestDetailUseCase.js'
import { NotFoundError } from '../../../shared/errors/index.js'

describe('GetConciliationRequestDetailUseCase', () => {
  it('returns the detail when found', async () => {
    const detail = {
      id: 'r-1', accountId: 'a-1', externalId: 'ext-1', expectedAmount: 100,
      currency: 'USD', senderName: 'Alice', status: 'matched', retryCount: 0,
      lastCheckedAt: null, createdAt: new Date(), bank: 'BankX', accountName: 'Main',
      attempts: [], match: null,
    }
    const readModel = {
      list: vi.fn(),
      findDetailForUser: vi.fn().mockResolvedValue(detail),
    }
    const useCase = new GetConciliationRequestDetailUseCase(readModel as any)
    const result = await useCase.execute('r-1', 'u-1')
    expect(readModel.findDetailForUser).toHaveBeenCalledWith('r-1', 'u-1')
    expect(result).toBe(detail)
  })

  it('throws NotFoundError when detail is missing', async () => {
    const readModel = {
      list: vi.fn(),
      findDetailForUser: vi.fn().mockResolvedValue(null),
    }
    const useCase = new GetConciliationRequestDetailUseCase(readModel as any)
    await expect(useCase.execute('missing', 'u-1')).rejects.toBeInstanceOf(NotFoundError)
  })
})
