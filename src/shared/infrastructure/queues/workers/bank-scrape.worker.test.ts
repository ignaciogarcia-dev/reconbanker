import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Handler = (...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

const WorkerCtor = vi.fn(function (this: unknown, _name: string, processor: Handler, opts: unknown) {
  return {
    name: _name,
    processor,
    opts,
    on: vi.fn((event: string, h: Handler) => { handlers.set(event, h) }),
  }
})

vi.mock('bullmq', () => ({
  Worker: WorkerCtor,
  Job: class {},
}))

vi.mock('../QueueRegistry.js', () => ({
  redis: { kind: 'fake-redis' },
}))

const { createBankScrapeWorker } = await import('./bank-scrape.worker.js')

function makeContainer() {
  const child = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(),
  }
  child.child.mockReturnValue(child)
  const runExecute = vi.fn(async () => {})
  return {
    container: {
      logger: { child: vi.fn(() => child) },
      banking: { runBankScrape: { execute: runExecute } },
    } as never,
    log: child,
    runExecute,
  }
}

describe('createBankScrapeWorker', () => {
  beforeEach(() => {
    handlers.clear()
    WorkerCtor.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('uses default concurrency when env not set', () => {
    delete process.env.BANK_SCRAPE_CONCURRENCY
    const { container } = makeContainer()
    createBankScrapeWorker(container)
    expect(WorkerCtor).toHaveBeenCalledWith(
      'bank-scrape',
      expect.any(Function),
      expect.objectContaining({
        concurrency: 2,
        lockDuration: 60_000,
        stalledInterval: 30_000,
        connection: { kind: 'fake-redis' },
      })
    )
  })

  it('honors a valid BANK_SCRAPE_CONCURRENCY override', () => {
    vi.stubEnv('BANK_SCRAPE_CONCURRENCY', '5')
    const { container } = makeContainer()
    createBankScrapeWorker(container)
    expect(WorkerCtor.mock.calls[0][2]).toEqual(expect.objectContaining({ concurrency: 5 }))
  })

  it('falls back to default when BANK_SCRAPE_CONCURRENCY is invalid', () => {
    vi.stubEnv('BANK_SCRAPE_CONCURRENCY', 'not-a-number')
    const { container } = makeContainer()
    createBankScrapeWorker(container)
    expect(WorkerCtor.mock.calls[0][2]).toEqual(expect.objectContaining({ concurrency: 2 }))
  })

  it('falls back to default when BANK_SCRAPE_CONCURRENCY is zero or negative', () => {
    vi.stubEnv('BANK_SCRAPE_CONCURRENCY', '0')
    const { container } = makeContainer()
    createBankScrapeWorker(container)
    expect(WorkerCtor.mock.calls[0][2]).toEqual(expect.objectContaining({ concurrency: 2 }))
  })

  it('processor runs the use case, logs, and extends lock periodically', async () => {
    const { container, log } = makeContainer()
    // make the use case wait so the keepAlive interval has time to fire
    let resolveExec!: () => void
    const execPromise = new Promise<void>((r) => { resolveExec = r })
    const runExecute = vi.fn().mockReturnValue(execPromise)
    ;(container as { banking: { runBankScrape: { execute: typeof runExecute } } }).banking.runBankScrape.execute = runExecute
    createBankScrapeWorker(container)
    const processor = WorkerCtor.mock.calls[0][1] as (job: unknown) => Promise<void>
    const extendLock = vi.fn().mockResolvedValue(undefined)
    const job = { id: 'j1', data: { accountId: 'a1' }, token: 'tok', extendLock }

    const promise = processor(job)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(extendLock).toHaveBeenCalledWith('tok', 60_000)
    resolveExec()
    await promise

    expect(runExecute).toHaveBeenCalledWith({ accountId: 'a1' })
    expect(log.info).toHaveBeenCalledWith('starting job j1', { jobData: { accountId: 'a1' } })
    expect(log.info).toHaveBeenCalledWith('job j1 completed')
  })

  it('processor logs and rethrows when use case fails', async () => {
    const { container, log } = makeContainer()
    const runExecute = vi.fn().mockRejectedValue(new Error('boom'))
    ;(container as { banking: { runBankScrape: { execute: typeof runExecute } } }).banking.runBankScrape.execute = runExecute
    createBankScrapeWorker(container)
    const processor = WorkerCtor.mock.calls[0][1] as (job: unknown) => Promise<void>

    const job = { id: 'j2', data: {}, token: 't', extendLock: vi.fn().mockResolvedValue(undefined) }
    await expect(processor(job)).rejects.toThrow('boom')
    expect(log.error).toHaveBeenCalledWith('job j2 failed', { error: 'boom' })
  })

  it('processor stringifies non-Error rejections', async () => {
    const { container, log } = makeContainer()
    const runExecute = vi.fn().mockRejectedValue('weird')
    ;(container as { banking: { runBankScrape: { execute: typeof runExecute } } }).banking.runBankScrape.execute = runExecute
    createBankScrapeWorker(container)
    const processor = WorkerCtor.mock.calls[0][1] as (job: unknown) => Promise<void>

    const job = { id: 'j3', data: {}, token: 't', extendLock: vi.fn().mockResolvedValue(undefined) }
    await expect(processor(job)).rejects.toBe('weird')
    expect(log.error).toHaveBeenCalledWith('job j3 failed', { error: 'weird' })
  })

  it('swallows extendLock rejections', async () => {
    const { container } = makeContainer()
    let resolveExec!: () => void
    const execPromise = new Promise<void>((r) => { resolveExec = r })
    const runExecute = vi.fn().mockReturnValue(execPromise)
    ;(container as { banking: { runBankScrape: { execute: typeof runExecute } } }).banking.runBankScrape.execute = runExecute
    createBankScrapeWorker(container)
    const processor = WorkerCtor.mock.calls[0][1] as (job: unknown) => Promise<void>
    const extendLock = vi.fn().mockRejectedValue(new Error('lock err'))
    const job = { id: 'j4', data: {}, token: 't', extendLock }

    const promise = processor(job)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(extendLock).toHaveBeenCalled()
    resolveExec()
    await expect(promise).resolves.toBeUndefined()
  })

  it('registers a failed handler that logs', () => {
    const { container, log } = makeContainer()
    createBankScrapeWorker(container)
    const failed = handlers.get('failed')!
    failed({ id: 'jX' }, new Error('whoops'))
    expect(log.error).toHaveBeenCalledWith('worker failed event', { jobId: 'jX', error: 'whoops' })

    failed(undefined, new Error('nojob'))
    expect(log.error).toHaveBeenCalledWith('worker failed event', { jobId: undefined, error: 'nojob' })
  })
})
