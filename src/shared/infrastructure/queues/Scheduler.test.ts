import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const orderIngestionAdd = vi.fn()
const enqueueBankScrapeMock = vi.fn()
const dbQuery = vi.fn()

vi.mock('./QueueRegistry.js', () => ({
  Queues: {
    orderIngestion: { add: orderIngestionAdd },
  },
}))

vi.mock('./BankScrapeQueue.js', () => ({
  enqueueBankScrape: enqueueBankScrapeMock,
}))

vi.mock('../db/client.js', () => ({
  db: { query: dbQuery },
}))

const { Scheduler } = await import('./Scheduler.js')
const { SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL, PERSISTENT_SESSION_CANDIDATES_SQL } = await import('./schedulerQueries.js')

function makeLogger() {
  const calls: Array<{ level: string; msg: string; meta?: unknown }> = []
  const child = {
    debug: vi.fn((msg: string, meta?: unknown) => calls.push({ level: 'debug', msg, meta })),
    info:  vi.fn((msg: string, meta?: unknown) => calls.push({ level: 'info', msg, meta })),
    warn:  vi.fn((msg: string, meta?: unknown) => calls.push({ level: 'warn', msg, meta })),
    error: vi.fn((msg: string, meta?: unknown) => calls.push({ level: 'error', msg, meta })),
    child: vi.fn(() => child),
  }
  return { child, calls }
}

function makeContainer(overrides: { isRunning?: (id: string) => boolean; expire?: () => Promise<void> } = {}) {
  const { child: log } = makeLogger()
  const expireExecute = vi.fn(overrides.expire ?? (async () => {}))
  const isRunning = vi.fn(overrides.isRunning ?? (() => false))
  const pruneRuns = vi.fn(async () => 0)
  return {
    container: {
      logger: { child: vi.fn(() => log) },
      banking: { sessionManager: { isRunning }, scrapeRunRepo: { pruneOlderThan: pruneRuns } },
      conciliation: { expireStaleRequests: { execute: expireExecute } },
    } as never,
    log,
    expireExecute,
    isRunning,
    pruneRuns,
  }
}

describe('Scheduler', () => {
  beforeEach(() => {
    orderIngestionAdd.mockReset()
    enqueueBankScrapeMock.mockReset()
    dbQuery.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('prunes old scrape runs on start and on its own interval, using the configured retention', async () => {
    dbQuery.mockResolvedValue({ rows: [] })
    vi.stubEnv('SCRAPE_RUN_RETENTION_DAYS', '30')
    vi.stubEnv('SCRAPE_RUN_PRUNE_INTERVAL_SECONDS', '3600')
    const { container, pruneRuns } = makeContainer()
    const scheduler = new Scheduler(container)

    await scheduler.start()
    expect(pruneRuns).toHaveBeenCalledWith(30)

    await vi.advanceTimersByTimeAsync(3600 * 1000)
    expect(pruneRuns).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('defaults scrape run retention to 90 days', async () => {
    dbQuery.mockResolvedValue({ rows: [] })
    const { container, pruneRuns } = makeContainer()
    const scheduler = new Scheduler(container)
    await scheduler.start()
    expect(pruneRuns).toHaveBeenCalledWith(90)
    scheduler.stop()
  })

  it('runs initial pass for polling, scraping, persistent sessions, and expire', async () => {
    dbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('status') && !sql.includes('LEFT JOIN') && !sql.includes('JOIN account_config')) {
        return { rows: [{ id: 'a1' }, { id: 'a2' }] }
      }
      if (sql === SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL) return { rows: [{ id: 'a3' }, { id: 'a4' }] }
      if (sql === PERSISTENT_SESSION_CANDIDATES_SQL) return { rows: [{ id: 'a5' }, { id: 'a6' }, { id: 'a7' }] }
      return { rows: [] }
    })
    enqueueBankScrapeMock
      .mockResolvedValueOnce({ queued: true })  // a3 one-shot
      .mockResolvedValueOnce({ queued: false, reason: 'already_queued' })  // a4 one-shot
      .mockResolvedValueOnce({ queued: true })  // a6 persistent
      .mockResolvedValueOnce({ queued: false, reason: 'already_queued' })  // a7 persistent

    const { container, expireExecute } = makeContainer({
      isRunning: (id) => id === 'a5',
    })
    const scheduler = new Scheduler(container)
    await scheduler.start()

    // polling enqueued 2 jobs
    expect(orderIngestionAdd).toHaveBeenCalledTimes(2)
    expect(orderIngestionAdd.mock.calls[0][0]).toBe('poll')
    expect(orderIngestionAdd.mock.calls[0][1]).toEqual({ accountId: 'a1' })
    // Idempotent jobId (no timestamp) so a slow/failed poll does not spawn a
    // second concurrent poll for the same account.
    expect(orderIngestionAdd.mock.calls[0][2]).toMatchObject({ jobId: 'poll-a1' })

    // scraping called for 2 one-shot accounts
    // persistent session: a5 is running, a6 not -> only a6 enqueued
    expect(enqueueBankScrapeMock).toHaveBeenCalledWith('a3')
    expect(enqueueBankScrapeMock).toHaveBeenCalledWith('a4')
    expect(enqueueBankScrapeMock).toHaveBeenCalledWith('a6')
    expect(enqueueBankScrapeMock).toHaveBeenCalledWith('a7')
    expect(enqueueBankScrapeMock).not.toHaveBeenCalledWith('a5')

    // expire ran
    expect(expireExecute).toHaveBeenCalledTimes(1)

    scheduler.stop()
  })

  it('honors env intervals and stops timers', async () => {
    vi.stubEnv('POLLING_INTERVAL_SECONDS', '1')
    vi.stubEnv('SCRAPE_INTERVAL_SECONDS', '1')
    vi.stubEnv('EXPIRE_STALE_REQUESTS_INTERVAL_SECONDS', '1')
    vi.stubEnv('SESSION_HEALTHCHECK_SECONDS', '1')

    dbQuery.mockResolvedValue({ rows: [] })
    enqueueBankScrapeMock.mockResolvedValue({ queued: true })

    const { container } = makeContainer()
    const scheduler = new Scheduler(container)
    await scheduler.start()

    // advance to trigger intervals
    await vi.advanceTimersByTimeAsync(1100)
    scheduler.stop()
    // after stop, further timer fires should not produce work
    orderIngestionAdd.mockClear()
    await vi.advanceTimersByTimeAsync(5000)
    expect(orderIngestionAdd).not.toHaveBeenCalled()
  })

  it('absorbs and logs errors thrown by recurring interval callbacks', async () => {
    vi.stubEnv('POLLING_INTERVAL_SECONDS', '1')
    dbQuery.mockResolvedValue({ rows: [] })
    const { container, log } = makeContainer()
    const scheduler = new Scheduler(container)
    await scheduler.start()

    // The recurring polling query now fails; the interval must not leak an
    // unhandled rejection — it should be caught and logged.
    dbQuery.mockRejectedValue(new Error('db down'))
    await vi.advanceTimersByTimeAsync(1100)
    scheduler.stop()

    expect(log.error).toHaveBeenCalled()
  })

  it('uses default intervals when env vars are not set', async () => {
    delete process.env.POLLING_INTERVAL_SECONDS
    delete process.env.SCRAPE_INTERVAL_SECONDS
    delete process.env.EXPIRE_STALE_REQUESTS_INTERVAL_SECONDS
    delete process.env.SESSION_HEALTHCHECK_SECONDS

    dbQuery.mockResolvedValue({ rows: [] })
    const { container, log } = makeContainer()
    const scheduler = new Scheduler(container)
    await scheduler.start()

    expect(log.info).toHaveBeenCalledWith('started', expect.objectContaining({
      pollingIntervalSec: 600,
      scrapeIntervalSec: 1200,
      sessionCheckSec: 75,
      expireIntervalSec: 3600,
    }))
    scheduler.stop()
    expect(log.info).toHaveBeenCalledWith('stopped')
  })
})
