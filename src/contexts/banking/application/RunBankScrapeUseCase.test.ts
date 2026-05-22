import { describe, it, expect, vi } from 'vitest'
import { RunBankScrapeUseCase } from './RunBankScrapeUseCase.js'
import { InMemoryEventBus } from '../../../shared/events/InMemoryEventBus.js'
import {
  InMemoryBankTransactionRepository,
  InMemoryScrapeRunRepository,
} from '../../../../tests/helpers/inMemoryBankRepos.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import type { IScriptEnginePort, ScrapedTransaction } from '../domain/IScriptEnginePort.js'

function buildSut(transactions: ScrapedTransaction[], opts: { hasScript?: boolean; hasAccount?: boolean } = {}) {
  const txRepo = new InMemoryBankTransactionRepository()
  const scrapeRunRepo = new InMemoryScrapeRunRepository()
  const eventBus = new InMemoryEventBus()
  const scriptEngine: IScriptEnginePort = {
    loadActiveScript: async () => (opts.hasScript === false ? null : { id: 'script-1', codeSnapshot: '' }),
    runScript: async () => transactions,
  }
  const accountReader = {
    findById: async (accountId: string) =>
      opts.hasAccount === false ? null : { id: accountId, userId: 'user-1', bank: 'test-bank', sessionType: 'one-shot' as const, loginMode: 'simple' as const },
  }
  const useCase = new RunBankScrapeUseCase({
    accountReader, txRepo, scrapeRunRepo, scriptEngine, eventBus,
  })
  return { useCase, txRepo, scrapeRunRepo, eventBus }
}

const sample = (externalId: string): ScrapedTransaction => ({
  externalId, referenceHash: `hash-${externalId}`, amount: 100, currency: 'USD',
  senderName: 'Alice', receivedAt: new Date(), raw: {},
})

describe('RunBankScrapeUseCase', () => {
  it('persists new transactions and publishes ingested events', async () => {
    const { useCase, txRepo, scrapeRunRepo, eventBus } = buildSut([sample('ext-1'), sample('ext-2')])
    const handler = vi.fn().mockResolvedValue(undefined)
    eventBus.subscribe('TransactionIngested', handler)

    await useCase.execute({ accountId: 'acc-1' })

    expect(txRepo.store.size).toBe(2)
    expect(scrapeRunRepo.runs[0].status).toBe('success')
    expect(scrapeRunRepo.runs[0].count).toBe(2)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('skips already-known transactions by externalId', async () => {
    const { useCase, txRepo } = buildSut([sample('ext-1'), sample('ext-1')])
    await useCase.execute({ accountId: 'acc-1' })
    expect(txRepo.store.size).toBe(1)
  })

  it('throws NotFoundError when account is missing', async () => {
    const { useCase } = buildSut([], { hasAccount: false })
    await expect(useCase.execute({ accountId: 'missing' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('marks run as failed and rethrows when script execution fails', async () => {
    const txRepo = new InMemoryBankTransactionRepository()
    const scrapeRunRepo = new InMemoryScrapeRunRepository()
    const eventBus = new InMemoryEventBus()
    const failHandler = vi.fn().mockResolvedValue(undefined)
    eventBus.subscribe('ScrapeRunFailed', failHandler)
    const useCase = new RunBankScrapeUseCase({
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'user-1', bank: 'b', sessionType: 'one-shot', loginMode: 'simple' }) },
      txRepo, scrapeRunRepo,
      scriptEngine: {
        loadActiveScript: async () => ({ id: 'script-1', codeSnapshot: '' }),
        runScript: async () => { throw new Error('script crashed') },
      },
      eventBus,
    })

    await expect(useCase.execute({ accountId: 'acc-1' })).rejects.toThrow('script crashed')
    expect(scrapeRunRepo.runs[0].status).toBe('failed')
    expect(failHandler).toHaveBeenCalledTimes(1)
  })
})
