import { Worker } from 'bullmq'
import { redis } from '../QueueRegistry.js'
import type { Container } from '../../../../composition/container.js'

export function createOrderIngestionWorker(container: Container): Worker {
  const log = container.logger.child('[order-ingestion]')

  const worker = new Worker(
    'order-ingestion',
    async (job) => {
      log.info(`starting job ${job.id}`, { jobData: job.data })
      try {
        await container.conciliation.pollPendingOrders.execute(job.data)
        log.info(`job ${job.id} completed`)
      } catch (err) {
        log.error(`job ${job.id} failed`, {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
        throw err
      }
    },
    { connection: redis }
  )

  worker.on('failed', (job, err) =>
    log.error(`worker failed event`, { jobId: job?.id, error: err.message, stack: err.stack })
  )
  return worker
}
