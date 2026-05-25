import { describe, it, expect, vi } from 'vitest'
import { RunBankScrapeUseCase } from './RunBankScrapeUseCase.js'
import { IngestTransactionsUseCase } from './IngestTransactionsUseCase.js'
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
  const ingest = new IngestTransactionsUseCase({ txRepo, eventBus })
  const scriptEngine: IScriptEnginePort = {
    loadActiveScript: async () => (opts.hasScript === false ? null : { id: 'script-1', codeSnapshot: '' }),
    runScript: async () => transactions,
  }
  const accountReader = {
    findById: async (accountId: string) =>
      opts.hasAccount === false
        ? null
        : { id: accountId, userId: 'user-1', bank: 'test-bank', sessionType: 'one-shot' as const, loginMode: 'simple' as const },
  }
  const blocker = { block: vi.fn().mockResolvedValue(undefined) }
  const useCase = new RunBankScrapeUseCase({
    accountReader, txRepo, scrapeRunRepo, scriptEngine, eventBus, ingest, blocker,
  })
  return { useCase, txRepo, scrapeRunRepo, eventBus, blocker }
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

  it('ensures a persistent session and skips one-shot scraping for persistent accounts', async () => {
    const txRepo = new InMemoryBankTransactionRepository()
    const scrapeRunRepo = new InMemoryScrapeRunRepository()
    const eventBus = new InMemoryEventBus()
    const ingest = new IngestTransactionsUseCase({ txRepo, eventBus })
    const ensureSession = vi.fn().mockResolvedValue(undefined)
    const runScript = vi.fn().mockResolvedValue([])
    const useCase = new RunBankScrapeUseCase({
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'u', bank: 'bancopichincha', sessionType: 'persistent' as const, loginMode: 'assisted' as const }) },
      txRepo, scrapeRunRepo,
      scriptEngine: { loadActiveScript: async () => ({ id: 's1', codeSnapshot: '' }), runScript },
      eventBus, ingest, ensureSession, blocker: { block: vi.fn().mockResolvedValue(undefined) },
    })

    await useCase.execute({ accountId: 'acc-1' })

    expect(ensureSession).toHaveBeenCalledWith('acc-1')
    expect(runScript).not.toHaveBeenCalled()
    expect(scrapeRunRepo.runs.length).toBe(0)
  })

  it('marks run as failed and rethrows when script execution fails', async () => {
    const txRepo = new InMemoryBankTransactionRepository()
    const scrapeRunRepo = new InMemoryScrapeRunRepository()
    const eventBus = new InMemoryEventBus()
    const ingest = new IngestTransactionsUseCase({ txRepo, eventBus })
    const failHandler = vi.fn().mockResolvedValue(undefined)
    eventBus.subscribe('ScrapeRunFailed', failHandler)
    const blocker = { block: vi.fn().mockResolvedValue(undefined) }
    const useCase = new RunBankScrapeUseCase({
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'user-1', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      txRepo, scrapeRunRepo,
      scriptEngine: {
        loadActiveScript: async () => ({ id: 'script-1', codeSnapshot: '' }),
        runScript: async () => { throw new Error('script crashed') },
      },
      eventBus, ingest, blocker,
    })

    await expect(useCase.execute({ accountId: 'acc-1' })).rejects.toThrow('script crashed')
    expect(scrapeRunRepo.runs[0].status).toBe('failed')
    expect(scrapeRunRepo.runs[0].failureType).toBe('unknown')
    expect(blocker.block).not.toHaveBeenCalled()
    expect(failHandler).toHaveBeenCalledTimes(1)
  })

  it('returns without scraping for persistent accounts when ensureSession is not provided', async () => {
    const txRepo = new InMemoryBankTransactionRepository()
    const scrapeRunRepo = new InMemoryScrapeRunRepository()
    const eventBus = new InMemoryEventBus()
    const ingest = new IngestTransactionsUseCase({ txRepo, eventBus })
    const runScript = vi.fn().mockResolvedValue([])
    const useCase = new RunBankScrapeUseCase({
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'u', bank: 'b', sessionType: 'persistent' as const, loginMode: 'assisted' as const }) },
      txRepo, scrapeRunRepo,
      scriptEngine: { loadActiveScript: async () => ({ id: 's1', codeSnapshot: '' }), runScript },
      eventBus, ingest, blocker: { block: vi.fn().mockResolvedValue(undefined) },
    })

    await useCase.execute({ accountId: 'acc-1' })

    expect(runScript).not.toHaveBeenCalled()
    expect(scrapeRunRepo.runs.length).toBe(0)
  })

  it('throws NotFoundError when no active script is found', async () => {
    const { useCase } = buildSut([], { hasScript: false })
    await expect(useCase.execute({ accountId: 'acc-1' })).rejects.toThrow(NotFoundError)
  })

  it('handles non-Error throwable from script and records failed run', async () => {
    const txRepo = new InMemoryBankTransactionRepository()
    const scrapeRunRepo = new InMemoryScrapeRunRepository()
    const eventBus = new InMemoryEventBus()
    const ingest = new IngestTransactionsUseCase({ txRepo, eventBus })
    const blocker = { block: vi.fn().mockResolvedValue(undefined) }
    const useCase = new RunBankScrapeUseCase({
      accountReader: { findById: async () => ({ id: 'acc-1', userId: 'u', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      txRepo, scrapeRunRepo,
      scriptEngine: {
        loadActiveScript: async () => ({ id: 'script-1', codeSnapshot: '' }),
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        runScript: async () => { throw 'plain-string-error' },
      },
      eventBus, ingest, blocker,
    })

    await expect(useCase.execute({ accountId: 'acc-1' })).rejects.toBe('plain-string-error')
    expect(scrapeRunRepo.runs[0].status).toBe('failed')
    expect(scrapeRunRepo.runs[0].error).toBe('plain-string-error')
  })

  it('blocks the account on a fatal (login) failure and records login_failed', async () => {
    const { txRepo, scrapeRunRepo, eventBus, blocker } = buildSut([])
    // Override the script to throw a fatal login error.
    const useCase = new RunBankScrapeUseCase({
      accountReader: { findById: async (id: string) => ({ id, userId: 'u', bank: 'b', sessionType: 'one-shot' as const, loginMode: 'simple' as const }) },
      txRepo, scrapeRunRepo, eventBus,
      ingest: new IngestTransactionsUseCase({ txRepo, eventBus }),
      blocker,
      scriptEngine: {
        loadActiveScript: async () => ({ id: 'script-1', codeSnapshot: '' }),
        runScript: async () => { throw new Error('login_failed: usuario o contraseña incorrectos') },
      },
    })

    await expect(useCase.execute({ accountId: 'acc-1' })).rejects.toThrow('login_failed')
    expect(blocker.block).toHaveBeenCalledWith('acc-1', 'login_failed: usuario o contraseña incorrectos')
    expect(scrapeRunRepo.runs[0].failureType).toBe('login_failed')
  })
})
