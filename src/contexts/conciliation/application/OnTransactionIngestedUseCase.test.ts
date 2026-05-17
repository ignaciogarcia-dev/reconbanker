import { describe, it, expect, vi } from 'vitest'
import { OnTransactionIngestedUseCase } from './OnTransactionIngestedUseCase.js'
import { InMemoryConciliationRequestRepository } from '../../../../tests/helpers/inMemoryConciliationRepos.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import { TransactionIngestedEvent } from '../../../shared/events/events/TransactionIngested.event.js'

describe('OnTransactionIngestedUseCase', () => {
  it('excludes the transaction when no active requests exist', async () => {
    const repo = new InMemoryConciliationRequestRepository()
    const markExcluded = vi.fn().mockResolvedValue(undefined)
    const enqueueProcess = vi.fn().mockResolvedValue(undefined)
    const useCase = new OnTransactionIngestedUseCase({
      requestRepo: repo,
      bankTransactionFinder: {
        findCandidatesForAccount: async () => [],
        findById: async () => null,
        isExcluded: async () => false,
        markExcluded,
      },
      enqueueProcess,
    })
    await useCase.execute(new TransactionIngestedEvent('tx-1', 'acc-1', 100, 'USD', new Date()))
    expect(markExcluded).toHaveBeenCalledWith('tx-1')
    expect(enqueueProcess).not.toHaveBeenCalled()
  })

  it('enqueues processing when there is an active request', async () => {
    const repo = new InMemoryConciliationRequestRepository()
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1', expectedAmount: 100, currency: 'USD',
    })
    repo.store.set(req.id, req)
    const markExcluded = vi.fn().mockResolvedValue(undefined)
    const enqueueProcess = vi.fn().mockResolvedValue(undefined)
    const useCase = new OnTransactionIngestedUseCase({
      requestRepo: repo,
      bankTransactionFinder: {
        findCandidatesForAccount: async () => [],
        findById: async () => null,
        isExcluded: async () => false,
        markExcluded,
      },
      enqueueProcess,
    })
    await useCase.execute(new TransactionIngestedEvent('tx-1', 'acc-1', 100, 'USD', new Date()))
    expect(enqueueProcess).toHaveBeenCalledWith('tx-1')
    expect(markExcluded).not.toHaveBeenCalled()
  })
})
