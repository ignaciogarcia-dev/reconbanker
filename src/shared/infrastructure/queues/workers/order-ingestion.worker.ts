import { Worker } from 'bullmq'
import { redis } from '../QueueRegistry.js'
import { logger } from '../../logger/index.js'

const log = logger.child('[order-ingestion]')

export const orderIngestionWorker = new Worker(
  'order-ingestion',
  async job => {
    log.info(`starting job ${job.id}`, { jobData: job.data })
    try {
      const mod = await import('../../../../contexts/conciliation/application/PollPendingOrdersUseCase.js')
      await new mod.PollPendingOrdersUseCase().execute(job.data)
      log.info(`job ${job.id} completed`)
    } catch (err) {
      log.error(`job ${job.id} failed`, { error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  },
  { connection: redis }
)

orderIngestionWorker.on('failed', (job, err) => {
  log.error(`worker failed event`, { jobId: job?.id, error: err.message })
})
