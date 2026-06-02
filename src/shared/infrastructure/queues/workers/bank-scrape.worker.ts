import { Worker, Job } from "bullmq"
import { redis } from "../QueueRegistry.js"
import type { Container } from "../../../../composition/container.js"

const DEFAULT_CONCURRENCY = 2

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
        await container.banking.runBankScrape.execute(job.data)
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
