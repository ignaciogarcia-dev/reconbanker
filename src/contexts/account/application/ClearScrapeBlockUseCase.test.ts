import { describe, it, expect, vi } from 'vitest'
import { ClearScrapeBlockUseCase } from './ClearScrapeBlockUseCase.js'
import { NotFoundError } from '../../../shared/errors/index.js'

describe('ClearScrapeBlockUseCase', () => {
  it('clears the block for an owned account', async () => {
    const clearScrapeBlock = vi.fn().mockResolvedValue(undefined)
    const accountRepo = {
      findByIdForUser: async (id: string) => ({ id, userId: 'u-1' }) as any,
      clearScrapeBlock,
    } as any
    const useCase = new ClearScrapeBlockUseCase(accountRepo)

    await useCase.execute('acc-1', 'u-1')

    expect(clearScrapeBlock).toHaveBeenCalledWith('acc-1')
  })

  it('throws NotFoundError for a missing or non-owned account', async () => {
    const clearScrapeBlock = vi.fn()
    const accountRepo = { findByIdForUser: async () => null, clearScrapeBlock } as any
    const useCase = new ClearScrapeBlockUseCase(accountRepo)

    await expect(useCase.execute('acc-1', 'u-1')).rejects.toBeInstanceOf(NotFoundError)
    expect(clearScrapeBlock).not.toHaveBeenCalled()
  })
})
