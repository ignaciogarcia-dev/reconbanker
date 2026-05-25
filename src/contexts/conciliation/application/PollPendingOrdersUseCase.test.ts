import { describe, it, expect, vi } from 'vitest'
import { PollPendingOrdersUseCase } from './PollPendingOrdersUseCase.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import { InMemoryConciliationRequestRepository } from '../../../../tests/helpers/inMemoryConciliationRepos.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'

function buildDeps(overrides: Partial<{
  config: any
  account: any
  mode: any
  orders: any[]
  cancelledCount: number
}> = {}) {
  const requestRepo = new InMemoryConciliationRequestRepository()
  if (overrides.cancelledCount !== undefined) {
    requestRepo.cancelMissing = vi.fn().mockResolvedValue(overrides.cancelledCount) as any
  }

  const configReader = {
    findPollingConfig: vi.fn().mockResolvedValue(overrides.config === undefined ? null : overrides.config),
    findWebhookConfigForRequest: vi.fn(),
    shouldNotifyOnExpired: vi.fn(),
  }
  const accountReader = {
    findById: vi.fn().mockResolvedValue(overrides.account === undefined ? null : overrides.account),
  }
  const userModeReader = {
    getOperationMode: vi.fn().mockResolvedValue(overrides.mode ?? 'reconcile'),
  }
  const orderSource = {
    fetch: vi.fn().mockResolvedValue(overrides.orders ?? []),
  }
  const enqueueRun = vi.fn().mockResolvedValue(undefined)
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() }

  return { requestRepo, configReader, accountReader, userModeReader, orderSource, enqueueRun, logger }
}

describe('PollPendingOrdersUseCase', () => {
  it('throws NotFoundError when no config', async () => {
    const deps = buildDeps({ config: null })
    const useCase = new PollPendingOrdersUseCase(deps as any)
    await expect(useCase.execute({ accountId: 'acc-1' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws NotFoundError when no account', async () => {
    const deps = buildDeps({
      config: { accountId: 'acc-1', pendingOrdersEndpoint: 'https://x', pollingMethod: 'GET', authType: null, authToken: null },
      account: null,
    })
    const useCase = new PollPendingOrdersUseCase(deps as any)
    await expect(useCase.execute({ accountId: 'acc-1' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('does nothing in passthrough mode (mode != reconcile)', async () => {
    const deps = buildDeps({
      config: { accountId: 'acc-1', pendingOrdersEndpoint: 'https://x', pollingMethod: 'GET', authType: null, authToken: null },
      account: { id: 'acc-1', userId: 'u-1' },
      mode: 'notify',
    })
    const useCase = new PollPendingOrdersUseCase(deps as any)
    await useCase.execute({ accountId: 'acc-1' })
    expect(deps.orderSource.fetch).not.toHaveBeenCalled()
  })

  it('returns early when pendingOrdersEndpoint is missing', async () => {
    const deps = buildDeps({
      config: { accountId: 'acc-1', pendingOrdersEndpoint: null, pollingMethod: 'GET', authType: null, authToken: null },
      account: { id: 'acc-1', userId: 'u-1' },
      mode: 'reconcile',
    })
    const useCase = new PollPendingOrdersUseCase(deps as any)
    await useCase.execute({ accountId: 'acc-1' })
    expect(deps.orderSource.fetch).not.toHaveBeenCalled()
  })

  it('creates requests for new external ids and skips existing ones', async () => {
    const deps = buildDeps({
      config: { accountId: 'acc-1', pendingOrdersEndpoint: 'https://x', pollingMethod: 'GET', authType: null, authToken: null },
      account: { id: 'acc-1', userId: 'u-1' },
      mode: 'reconcile',
      orders: [
        { externalId: 'ext-new', amount: 100, currency: 'USD', senderName: 'Alice' },
        { externalId: 'ext-existing', amount: 200, currency: 'USD', senderName: 'Bob' },
      ],
      cancelledCount: 0,
    })
    const existing = ConciliationRequest.reconstitute('exists-id', {
      accountId: 'acc-1', externalId: 'ext-existing', expectedAmount: 200, currency: 'USD',
      status: 'pending', retryCount: 0, createdAt: new Date(),
    })
    deps.requestRepo.store.set(existing.id, existing)

    const useCase = new PollPendingOrdersUseCase(deps as any)
    await useCase.execute({ accountId: 'acc-1' })

    const stored = [...deps.requestRepo.store.values()]
    expect(stored).toHaveLength(2)
    expect(stored.some((r) => r.externalId === 'ext-new')).toBe(true)
    expect(deps.enqueueRun).toHaveBeenCalledTimes(1)
    expect(deps.logger.info).not.toHaveBeenCalled()
  })

  it('logs cancellations when cancelledCount > 0', async () => {
    const deps = buildDeps({
      config: { accountId: 'acc-1', pendingOrdersEndpoint: 'https://x', pollingMethod: 'GET', authType: null, authToken: null },
      account: { id: 'acc-1', userId: 'u-1' },
      mode: 'reconcile',
      orders: [],
      cancelledCount: 3,
    })
    const useCase = new PollPendingOrdersUseCase(deps as any)
    await useCase.execute({ accountId: 'acc-1' })
    expect(deps.logger.info).toHaveBeenCalledWith(
      'cancelled orders missing from source',
      expect.objectContaining({ accountId: 'acc-1', cancelledCount: 3 })
    )
  })

  it('works without optional logger', async () => {
    const deps = buildDeps({
      config: { accountId: 'acc-1', pendingOrdersEndpoint: 'https://x', pollingMethod: 'GET', authType: null, authToken: null },
      account: { id: 'acc-1', userId: 'u-1' },
      mode: 'reconcile',
      orders: [],
      cancelledCount: 5,
    })
    const { logger: _l, ...rest } = deps
    const useCase = new PollPendingOrdersUseCase(rest as any)
    await expect(useCase.execute({ accountId: 'acc-1' })).resolves.toBeUndefined()
  })
})
