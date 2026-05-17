import { describe, it, expect, vi } from 'vitest'
import { ExpireStaleRequestsUseCase } from './ExpireStaleRequestsUseCase.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import { InMemoryEventBus } from '../../../shared/events/InMemoryEventBus.js'
import { InMemoryConciliationRequestRepository } from '../../../../tests/helpers/inMemoryConciliationRepos.js'

describe('ExpireStaleRequestsUseCase', () => {
  it('expires only stale pending/not_found requests and emits events', async () => {
    const repo = new InMemoryConciliationRequestRepository()
    const old = ConciliationRequest.reconstitute('old-1', {
      accountId: 'acc-1', externalId: 'ext-1', expectedAmount: 100, currency: 'USD',
      status: 'pending', retryCount: 0,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    })
    const fresh = ConciliationRequest.reconstitute('fresh-1', {
      accountId: 'acc-1', externalId: 'ext-2', expectedAmount: 100, currency: 'USD',
      status: 'pending', retryCount: 0,
      createdAt: new Date(),
    })
    repo.store.set(old.id, old)
    repo.store.set(fresh.id, fresh)

    const eventBus = new InMemoryEventBus()
    const handler = vi.fn().mockResolvedValue(undefined)
    eventBus.subscribe('ConciliationExpired', handler)

    const enqueueWebhook = vi.fn().mockResolvedValue(undefined)
    const useCase = new ExpireStaleRequestsUseCase({
      requestRepo: repo,
      configReader: { shouldNotifyOnExpired: async () => true } as any,
      eventBus, enqueueWebhook,
    })

    await useCase.execute()

    expect(repo.store.get('old-1')!.status).toBe('expired')
    expect(repo.store.get('fresh-1')!.status).toBe('pending')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(enqueueWebhook).toHaveBeenCalledWith('old-1')
  })

  it('does not enqueue webhook when notify_on_expired is false', async () => {
    const repo = new InMemoryConciliationRequestRepository()
    const old = ConciliationRequest.reconstitute('old-1', {
      accountId: 'acc-1', externalId: 'ext-1', expectedAmount: 100, currency: 'USD',
      status: 'pending', retryCount: 0,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    })
    repo.store.set(old.id, old)

    const enqueueWebhook = vi.fn().mockResolvedValue(undefined)
    const useCase = new ExpireStaleRequestsUseCase({
      requestRepo: repo,
      configReader: { shouldNotifyOnExpired: async () => false } as any,
      eventBus: new InMemoryEventBus(),
      enqueueWebhook,
    })

    await useCase.execute()
    expect(enqueueWebhook).not.toHaveBeenCalled()
  })
})
