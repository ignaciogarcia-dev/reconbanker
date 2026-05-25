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

  it('does nothing when there are no stale requests', async () => {
    const repo = new InMemoryConciliationRequestRepository()
    const enqueueWebhook = vi.fn().mockResolvedValue(undefined)
    const useCase = new ExpireStaleRequestsUseCase({
      requestRepo: repo,
      configReader: { shouldNotifyOnExpired: async () => true } as any,
      eventBus: new InMemoryEventBus(),
      enqueueWebhook,
    })
    await useCase.execute()
    expect(enqueueWebhook).not.toHaveBeenCalled()
  })

  it('skips when the stale reference no longer resolves to a request', async () => {
    const repo = new InMemoryConciliationRequestRepository()
    // Inject a fake findStale that yields a ref but findById returns null.
    repo.findStale = async () => [{ id: 'ghost', accountId: 'acc-1' }]
    repo.findById = async () => null as any
    const enqueueWebhook = vi.fn().mockResolvedValue(undefined)
    const useCase = new ExpireStaleRequestsUseCase({
      requestRepo: repo,
      configReader: { shouldNotifyOnExpired: async () => true } as any,
      eventBus: new InMemoryEventBus(),
      enqueueWebhook,
    })
    await useCase.execute()
    expect(enqueueWebhook).not.toHaveBeenCalled()
  })

  it('skips persistence when markExpired produces no events (terminal request)', async () => {
    const repo = new InMemoryConciliationRequestRepository()
    const saveSpy = vi.fn().mockResolvedValue(undefined)
    repo.save = saveSpy
    const terminal = ConciliationRequest.reconstitute('term-1', {
      accountId: 'acc-1', externalId: 'ext-1', expectedAmount: 100, currency: 'USD',
      status: 'pending', retryCount: 0,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    })
    repo.store.set(terminal.id, terminal)
    // Force findStale to yield the terminal request, then make markExpired a noop.
    repo.findStale = async () => [{ id: terminal.id, accountId: terminal.accountId }]
    ;(terminal as any).markExpired = () => { /* no events */ }
    const enqueueWebhook = vi.fn().mockResolvedValue(undefined)
    const useCase = new ExpireStaleRequestsUseCase({
      requestRepo: repo,
      configReader: { shouldNotifyOnExpired: async () => true } as any,
      eventBus: new InMemoryEventBus(),
      enqueueWebhook,
    })
    await useCase.execute()
    expect(saveSpy).not.toHaveBeenCalled()
    expect(enqueueWebhook).not.toHaveBeenCalled()
  })

  it('invokes logger when provided and there are stale requests', async () => {
    const repo = new InMemoryConciliationRequestRepository()
    const old = ConciliationRequest.reconstitute('old-1', {
      accountId: 'acc-1', externalId: 'ext-1', expectedAmount: 100, currency: 'USD',
      status: 'pending', retryCount: 0,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    })
    repo.store.set(old.id, old)
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    const useCase = new ExpireStaleRequestsUseCase({
      requestRepo: repo,
      configReader: { shouldNotifyOnExpired: async () => false } as any,
      eventBus: new InMemoryEventBus(),
      enqueueWebhook: vi.fn().mockResolvedValue(undefined),
      logger: logger as any,
    })
    await useCase.execute()
    expect(logger.info).toHaveBeenCalledWith('expired stale requests', expect.objectContaining({ count: 1 }))
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
