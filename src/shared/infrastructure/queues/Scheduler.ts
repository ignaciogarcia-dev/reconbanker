import { Queues } from './QueueRegistry.js'
import { enqueueBankScrape } from './BankScrapeQueue.js'
import { db } from '../db/client.js'
import {
  SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL,
  PERSISTENT_SESSION_CANDIDATES_SQL,
} from './schedulerQueries.js'
import type { Container } from '../../../composition/container.js'

export class Scheduler {
  private timers: NodeJS.Timeout[] = []
  private readonly log

  constructor(private readonly container: Container) {
    this.log = container.logger.child('[scheduler]')
  }

  async start(): Promise<void> {
    const pollingInterval = Number(process.env.POLLING_INTERVAL_SECONDS ?? 600) * 1000
    const scrapeInterval  = Number(process.env.SCRAPE_INTERVAL_SECONDS ?? 1200) * 1000
    const expireInterval  = Number(process.env.EXPIRE_STALE_REQUESTS_INTERVAL_SECONDS ?? 3600) * 1000
    const sessionCheckInterval = Number(process.env.SESSION_HEALTHCHECK_SECONDS ?? 75) * 1000

    await this.enqueuePolling()
    await this.enqueueScraping()
    await this.ensurePersistentSessions()
    await this.expireStaleRequests()

    this.timers.push(
      setInterval(() => this.enqueuePolling(),  pollingInterval),
      setInterval(() => this.enqueueScraping(), scrapeInterval),
      setInterval(() => this.ensurePersistentSessions(), sessionCheckInterval),
      setInterval(() => this.expireStaleRequests(), expireInterval),
    )

    this.log.info('started', {
      pollingIntervalSec: pollingInterval / 1000,
      scrapeIntervalSec: scrapeInterval / 1000,
      sessionCheckSec: sessionCheckInterval / 1000,
      expireIntervalSec: expireInterval / 1000,
    })
  }

  stop(): void {
    this.timers.forEach(t => clearInterval(t))
    this.timers = []
    this.log.info('stopped')
  }

  private async enqueuePolling(): Promise<void> {
    const { rows: accounts } = await db.query(
      `SELECT id FROM accounts WHERE status = 'active'`
    )

    for (const account of accounts) {
      await Queues.orderIngestion.add(
        'poll',
        { accountId: account.id },
        { jobId: `poll:${account.id}:${Date.now()}`, removeOnComplete: true, removeOnFail: 100 }
      )
    }

    this.log.info(`enqueued polling`, { accountCount: accounts.length })
  }

  private async enqueueScraping(): Promise<void> {
    const { rows: accounts } = await db.query(SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL)

    let queued = 0
    let skipped = 0
    for (const account of accounts) {
      const result = await enqueueBankScrape(account.id)
      if (result.queued) queued += 1
      else {
        skipped += 1
        this.log.debug(`skipping scrape — already queued`, { accountId: account.id })
      }
    }

    this.log.info(`enqueued scraping`, { queued, skipped })
  }

  private async ensurePersistentSessions(): Promise<void> {
    const { rows: accounts } = await db.query(PERSISTENT_SESSION_CANDIDATES_SQL)

    let launched = 0
    for (const account of accounts) {
      if (this.container.banking.sessionManager.isRunning(account.id)) continue
      const result = await enqueueBankScrape(account.id)
      if (result.queued) launched += 1
    }
    this.log.info(`persistent session health-check`, { candidates: accounts.length, launched })
  }

  private async expireStaleRequests(): Promise<void> {
    await this.container.conciliation.expireStaleRequests.execute()
  }
}
