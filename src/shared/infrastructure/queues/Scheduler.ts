import { Queues } from './QueueRegistry.js'
import { enqueueBankScrape } from './BankScrapeQueue.js'
import { db } from '../db/client.js'
import { ExpireStaleRequestsUseCase } from '../../../contexts/conciliation/application/ExpireStaleRequestsUseCase.js'
import { logger } from '../logger/index.js'

const log = logger.child('[scheduler]')

export class Scheduler {
  private timers: NodeJS.Timeout[] = []
  private expireUseCase = new ExpireStaleRequestsUseCase()

  async start(): Promise<void> {
    const pollingInterval = Number(process.env.POLLING_INTERVAL_SECONDS ?? 600) * 1000
    const scrapeInterval  = Number(process.env.SCRAPE_INTERVAL_SECONDS ?? 1200) * 1000
    const expireInterval  = Number(process.env.EXPIRE_STALE_REQUESTS_INTERVAL_SECONDS ?? 3600) * 1000

    // Run once now, then loop.
    await this.enqueuePolling()
    await this.enqueueScraping()
    await this.expireStaleRequests()

    this.timers.push(
      setInterval(() => this.enqueuePolling(),  pollingInterval),
      setInterval(() => this.enqueueScraping(), scrapeInterval),
      setInterval(() => this.expireStaleRequests(), expireInterval),
    )

    log.info('started', { pollingIntervalSec: pollingInterval / 1000, scrapeIntervalSec: scrapeInterval / 1000, expireIntervalSec: expireInterval / 1000 })
  }

  stop(): void {
    this.timers.forEach(t => clearInterval(t))
    this.timers = []
    log.info('stopped')
  }

  private async enqueuePolling(): Promise<void> {
    const { rows: accounts } = await db.query(
      `SELECT id FROM accounts WHERE status = 'active'`
    )

    for (const account of accounts) {
      await Queues.orderIngestion.add(
        'poll',
        { accountId: account.id },
        {
          jobId: `poll:${account.id}:${Date.now()}`,
          removeOnComplete: true,
          removeOnFail: 100,
        }
      )
    }

    log.info(`enqueued polling`, { accountCount: accounts.length })
  }

  private async enqueueScraping(): Promise<void> {
    const { rows: accounts } = await db.query(
      `SELECT id FROM accounts WHERE status = 'active'`
    )

    let queued = 0
    let skipped = 0

    for (const account of accounts) {
      const result = await enqueueBankScrape(account.id)

      if (result.queued) {
        queued += 1
      } else {
        skipped += 1
        log.debug(`skipping scrape — already queued`, { accountId: account.id })
      }
    }

    log.info(`enqueued scraping`, { queued, skipped })
  }

  private async expireStaleRequests(): Promise<void> {
    await this.expireUseCase.execute()
  }
}
