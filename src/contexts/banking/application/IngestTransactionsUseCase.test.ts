import { describe, it, expect, vi } from 'vitest'
import { IngestTransactionsUseCase } from './IngestTransactionsUseCase.js'
import { InMemoryEventBus } from '../../../shared/events/InMemoryEventBus.js'
import { InMemoryBankTransactionRepository } from '../../../../tests/helpers/inMemoryBankRepos.js'
import type { ScrapedTransaction } from '../domain/IScriptEnginePort.js'

const sample = (externalId: string): ScrapedTransaction => ({
  externalId, referenceHash: `hash-${externalId}`, amount: 100, currency: 'USD',
  senderName: 'Alice', receivedAt: new Date(), raw: {},
})

describe('IngestTransactionsUseCase', () => {
  it('saves new transactions and publishes ingested events, returning the saved count', async () => {
    const txRepo = new InMemoryBankTransactionRepository()
    const eventBus = new InMemoryEventBus()
    const handler = vi.fn().mockResolvedValue(undefined)
    eventBus.subscribe('TransactionIngested', handler)
    const useCase = new IngestTransactionsUseCase({ txRepo, eventBus })

    const saved = await useCase.execute('acc-1', 'script-1', [sample('ext-1'), sample('ext-2')])

    expect(saved).toBe(2)
    expect(txRepo.store.size).toBe(2)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('skips transactions whose externalId already exists', async () => {
    const txRepo = new InMemoryBankTransactionRepository()
    const eventBus = new InMemoryEventBus()
    const useCase = new IngestTransactionsUseCase({ txRepo, eventBus })

    await useCase.execute('acc-1', 'script-1', [sample('ext-1')])
    const saved = await useCase.execute('acc-1', 'script-1', [sample('ext-1'), sample('ext-2')])

    expect(saved).toBe(1)
    expect(txRepo.store.size).toBe(2)
  })

  it('does not publish an event when the insert was a no-op (lost the concurrent dedup race)', async () => {
    const eventBus = new InMemoryEventBus()
    const handler = vi.fn().mockResolvedValue(undefined)
    eventBus.subscribe('TransactionIngested', handler)
    // The row looks absent at check time, but ON CONFLICT DO NOTHING means the
    // INSERT did not actually persist (a concurrent process won the race).
    const txRepo: any = {
      withTx: () => txRepo,
      findByExternalId: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(false),
    }
    const useCase = new IngestTransactionsUseCase({ txRepo, eventBus })

    const saved = await useCase.execute('acc-1', 'script-1', [sample('ext-1')])

    expect(saved).toBe(0)
    expect(handler).not.toHaveBeenCalled()
  })
})
