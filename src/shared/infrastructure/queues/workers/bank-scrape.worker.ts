import { Worker, Job } from "bullmq"
import { redis } from "../QueueRegistry.js"
import { withTimeout } from "../../../util/withTimeout.js"
import type { Container } from "../../../../composition/container.js"

const DEFAULT_CONCURRENCY = 2

// Hard ceiling on a whole job, above the use-case run backstop (13 min). The
// keepAlive renews the lock indefinitely, so without this an execute() that hangs
// on an unbounded await (e.g. a stuck DB call) would wedge the slot forever.
const JOB_TIMEOUT_MS = Number(process.env.BANK_SCRAPE_JOB_TIMEOUT_MS ?? 15 * 60_000)

export function createBankScrapeWorker(container: Container): Worker {
  const log = container.logger.child('[bank-scrape]')
  const concurrencyEnv = Number(process.env.BANK_SCRAPE_CONCURRENCY ?? DEFAULT_CONCURRENCY)
  const concurrency = Number.isFinite(concurrencyEnv) && concurrencyEnv > 0 ? concurrencyEnv : DEFAULT_CONCURRENCY

  const worker = new Worker(
    "bank-scrape",
    async (job: Job) => {
      log.info(`starting job ${job.id}`, { jobData: job.data })

      const keepAlive = setInterval(() => {
        job.extendLock(job.token!, 60_000).catch(() => {})
      }, 30_000)

      try {
        await withTimeout(
          container.banking.runBankScrape.execute(job.data),
          JOB_TIMEOUT_MS,
          `scrape job ${job.id}`,
        )
        log.info(`job ${job.id} completed`)
      } catch (err) {
        log.error(`job ${job.id} failed`, {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
        throw err
      } finally {
        clearInterval(keepAlive)
      }
    },
    {
      connection: redis,
      concurrency,
      lockDuration: 60_000,
      stalledInterval: 30_000,
    },
  )

  worker.on("failed", (job, err) => {
    log.error(`worker failed event`, { jobId: job?.id, error: err.message, stack: err.stack })
  })

  return worker
}
