import { Queues } from './QueueRegistry.js'
import { enqueueBankScrape } from './BankScrapeQueue.js'
import { db } from '../db/client.js'
import { ExpireStaleRequestsUseCase } from '../../../contexts/conciliation/application/ExpireStaleRequestsUseCase.js'

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

    console.log(
      `Scheduler started — polling every ${pollingInterval / 1000}s, scraping every ${scrapeInterval / 1000}s, expiring every ${expireInterval / 1000}s`
    )
  }

  stop(): void {
    this.timers.forEach(t => clearInterval(t))
    this.timers = []
    console.log('Scheduler stopped')
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

    console.log(`[Scheduler] Enqueued polling for ${accounts.length} account(s)`)
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
        console.log(`[Scheduler] Skipping scrape for ${account.id} — already queued`)
      }
    }

    console.log(`[Scheduler] Enqueued scraping for ${queued} account(s), skipped ${skipped}`)
  }

  private async expireStaleRequests(): Promise<void> {
    await this.expireUseCase.execute()
  }
}
