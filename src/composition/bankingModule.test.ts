import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../shared/infrastructure/queues/QueueRegistry.js', () => {
  const make = () => ({ add: vi.fn().mockResolvedValue(undefined) })
  return {
    redis: {} as any,
    Queues: {
      orderIngestion: make(),
      bankScrape: make(),
      conciliation: make(),
      txConciliation: make(),
      webhook: make(),
      bankMovementWebhook: make(),
    },
  }
})

vi.mock('../shared/infrastructure/db/client.js', () => ({
  db: { query: vi.fn() },
}))

vi.mock('../contexts/script-engine/infrastructure/ScriptLoader.js', () => ({
  ScriptLoader: { loadActive: vi.fn() },
}))

vi.mock('../contexts/script-engine/infrastructure/PersistentPlaywrightRunner.js', () => {
  const start = vi.fn()
  class PersistentPlaywrightRunner {
    start = start
  }
  ;(PersistentPlaywrightRunner as any).__start = start
  return { PersistentPlaywrightRunner }
})

import { buildBankingModule } from './bankingModule.js'
import { RunBankScrapeUseCase } from '../contexts/banking/application/RunBankScrapeUseCase.js'
import { NotifyBankMovementUseCase } from '../contexts/banking/application/NotifyBankMovementUseCase.js'
import { ListBankMovementsUseCase } from '../contexts/banking/application/ListBankMovementsUseCase.js'
import { ReNotifyBankMovementUseCase } from '../contexts/banking/application/ReNotifyBankMovementUseCase.js'
import { db } from '../shared/infrastructure/db/client.js'
import { ScriptLoader } from '../contexts/script-engine/infrastructure/ScriptLoader.js'
import { PersistentPlaywrightRunner } from '../contexts/script-engine/infrastructure/PersistentPlaywrightRunner.js'
import { Queues } from '../shared/infrastructure/queues/QueueRegistry.js'

const dbMock = db as unknown as { query: ReturnType<typeof vi.fn> }
const scriptLoaderMock = ScriptLoader as unknown as { loadActive: ReturnType<typeof vi.fn> }
const runnerStartMock = (PersistentPlaywrightRunner as unknown as { __start: ReturnType<typeof vi.fn> }).__start

function makeContainer() {
  const logger: any = { debug() {}, info() {}, warn() {}, error() {}, child() { return logger } }
  const accountRepository: any = { findById: vi.fn() }
  const accountConfigRepository: any = { findByAccountId: vi.fn() }
  return {
    pool: { query: vi.fn(async () => ({ rows: [] })) } as any,
    logger,
    eventBus: { publish: vi.fn(), subscribe: vi.fn() } as any,
    unitOfWork: { run: async (fn: any) => fn({}) } as any,
    webhookLog: { record: vi.fn() } as any,
    account: {
      accountRepository,
      accountConfigRepository,
    } as any,
    user: {
      userRepository: {} as any,
    } as any,
  }
}

describe('buildBankingModule', () => {
  beforeEach(() => {
    dbMock.query.mockReset()
    scriptLoaderMock.loadActive.mockReset()
    runnerStartMock.mockReset()
  })

  it('wires every banking use case and exposes the session manager', () => {
    const mod = buildBankingModule(makeContainer())
    expect(mod.runBankScrape).toBeInstanceOf(RunBankScrapeUseCase)
    expect(mod.notifyBankMovement).toBeInstanceOf(NotifyBankMovementUseCase)
    expect(mod.listBankMovements).toBeInstanceOf(ListBankMovementsUseCase)
    expect(mod.reNotifyBankMovement).toBeInstanceOf(ReNotifyBankMovementUseCase)
    expect(mod.bankTransactionRepository).toBeDefined()
    expect(mod.sessionManager).toBeDefined()
  })

  it('enqueueNotify closure adds a job onto bankMovementWebhook', async () => {
    const mod = buildBankingModule(makeContainer())
    await (mod.reNotifyBankMovement as any).deps.enqueueNotify('tx-1')
    expect((Queues as any).bankMovementWebhook.add).toHaveBeenCalledWith(
      'notify',
      { bankTransactionId: 'tx-1' },
      expect.objectContaining({ jobId: 'bank-movement-webhook_tx-1', removeOnComplete: true }),
    )
  })

  it('ensureSession closure delegates to sessionManager.ensureRunning', async () => {
    const c = makeContainer()
    const mod = buildBankingModule(c)
    const spy = vi.spyOn(mod.sessionManager, 'ensureRunning').mockResolvedValue(undefined)
    await (mod.runBankScrape as any).deps.ensureSession('acc-x')
    expect(spy).toHaveBeenCalledWith('acc-x')
  })

  describe('startFn (via sessionManager.ensureRunning)', () => {
    it('throws when the account is not found', async () => {
      const c = makeContainer()
      c.account.accountRepository.findById.mockResolvedValue(null)
      const mod = buildBankingModule(c)
      await expect(mod.sessionManager.ensureRunning('acc-x')).rejects.toThrow('Account acc-x not found')
    })

    it('throws when there are no valid credentials', async () => {
      const c = makeContainer()
      c.account.accountRepository.findById.mockResolvedValue({
        id: 'acc-1', userId: 'u', bank: 'TEST',
      })
      c.account.accountConfigRepository.findByAccountId.mockResolvedValue({
        sessionType: 'persistent', loginMode: 'simple',
      })
      dbMock.query.mockResolvedValueOnce({ rows: [] })
      const mod = buildBankingModule(c)
      await expect(mod.sessionManager.ensureRunning('acc-1')).rejects.toThrow('No valid credentials for account acc-1')
    })

    it('throws when there is no active script', async () => {
      const c = makeContainer()
      c.account.accountRepository.findById.mockResolvedValue({
        id: 'acc-1', userId: 'u', bank: 'TEST',
      })
      c.account.accountConfigRepository.findByAccountId.mockResolvedValue({
        sessionType: 'persistent', loginMode: 'simple',
      })
      dbMock.query.mockResolvedValueOnce({ rows: [{ username: 'u', encrypted_password: 'p' }] })
      scriptLoaderMock.loadActive.mockResolvedValue(null)
      const mod = buildBankingModule(c)
      await expect(mod.sessionManager.ensureRunning('acc-1')).rejects.toThrow('No active script for TEST')
    })

    it('throws when the active script has no codeSnapshot', async () => {
      const c = makeContainer()
      c.account.accountRepository.findById.mockResolvedValue({
        id: 'acc-1', userId: 'u', bank: 'TEST',
      })
      c.account.accountConfigRepository.findByAccountId.mockResolvedValue({
        sessionType: 'persistent', loginMode: 'simple',
      })
      dbMock.query.mockResolvedValueOnce({ rows: [{ username: 'u', encrypted_password: 'p' }] })
      scriptLoaderMock.loadActive.mockResolvedValue({ id: 's', codeSnapshot: '' })
      const mod = buildBankingModule(c)
      await expect(mod.sessionManager.ensureRunning('acc-1')).rejects.toThrow('No active script for TEST')
    })

    it('starts the persistent runner with context, ingest hook, and bank-day getter', async () => {
      const c = makeContainer()
      c.account.accountRepository.findById.mockResolvedValue({
        id: 'acc-1', userId: 'u', bank: 'TEST',
      })
      c.account.accountConfigRepository.findByAccountId.mockResolvedValue({
        sessionType: 'persistent', loginMode: 'assisted',
      })
      dbMock.query.mockResolvedValueOnce({ rows: [{ username: 'user', encrypted_password: 'pw' }] })
      scriptLoaderMock.loadActive.mockResolvedValue({ id: 'script-1', codeSnapshot: 'code()' })
      ;(c.pool as any).query.mockResolvedValue({ rows: [{ external_id: 'ext-last' }] })
      runnerStartMock.mockResolvedValue({ stop: vi.fn(), done: new Promise(() => {}) })

      const prev = process.env.PERSISTENT_POLL_INTERVAL_MS
      process.env.PERSISTENT_POLL_INTERVAL_MS = '12345'

      const mod = buildBankingModule(c)
      await mod.sessionManager.ensureRunning('acc-1')

      expect(runnerStartMock).toHaveBeenCalledOnce()
      const arg = runnerStartMock.mock.calls[0][0]
      expect(arg.scriptCode).toBe('code()')
      expect(arg.loginMode).toBe('assisted')
      expect(arg.pollIntervalMs).toBe(12345)
      expect(arg.context).toMatchObject({ accountId: 'acc-1', username: 'user', password: 'pw' })
      expect(typeof arg.onTransactions).toBe('function')
      expect(arg.shouldStop()).toBe(false)
      expect(typeof arg.getBankDay()).toBe('string')

      await arg.onTransactions([])

      if (prev === undefined) delete process.env.PERSISTENT_POLL_INTERVAL_MS
      else process.env.PERSISTENT_POLL_INTERVAL_MS = prev
    })

    it('uses the default poll interval when PERSISTENT_POLL_INTERVAL_MS is unset', async () => {
      const c = makeContainer()
      c.account.accountRepository.findById.mockResolvedValue({
        id: 'acc-1', userId: 'u', bank: 'TEST',
      })
      c.account.accountConfigRepository.findByAccountId.mockResolvedValue({
        sessionType: 'persistent', loginMode: 'simple',
      })
      dbMock.query.mockResolvedValueOnce({ rows: [{ username: 'user', encrypted_password: 'pw' }] })
      scriptLoaderMock.loadActive.mockResolvedValue({ id: 'script-1', codeSnapshot: 'code()' })
      ;(c.pool as any).query.mockResolvedValue({ rows: [] })
      runnerStartMock.mockResolvedValue({ stop: vi.fn(), done: new Promise(() => {}) })

      const prev = process.env.PERSISTENT_POLL_INTERVAL_MS
      delete process.env.PERSISTENT_POLL_INTERVAL_MS

      const mod = buildBankingModule(c)
      await mod.sessionManager.ensureRunning('acc-1')
      expect(runnerStartMock.mock.calls[0][0].pollIntervalMs).toBe(60_000)

      if (prev !== undefined) process.env.PERSISTENT_POLL_INTERVAL_MS = prev
    })
  })
})
