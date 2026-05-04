import { Worker } from 'bullmq'
import { redis } from '../QueueRegistry.js'
import { logger } from '../../logger/index.js'

const conciliationLog = logger.child('[conciliation]')
const txConciliationLog = logger.child('[tx-conciliation]')
const webhookLog = logger.child('[webhook]')
const bankMovementWebhookLog = logger.child('[bank-movement-webhook]')

export const conciliationWorker = new Worker(
  'conciliation',
  async job => {
    const mod = await import('../../../../contexts/conciliation/application/RunConciliationUseCase.js')
    await new mod.RunConciliationUseCase().execute(job.data)
  },
  { connection: redis }
)

conciliationWorker.on('completed', job => {
  conciliationLog.info(`job ${job.id} completed`)
})

conciliationWorker.on('failed', (job, err) => {
  conciliationLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message })
})

export const txConciliationWorker = new Worker(
  'tx-conciliation',
  async job => {
    const mod = await import('../../../../contexts/conciliation/application/ProcessIncomingTransactionUseCase.js')
    await new mod.ProcessIncomingTransactionUseCase().execute(job.data)
  },
  { connection: redis }
)

txConciliationWorker.on('completed', job => {
  txConciliationLog.info(`job ${job.id} completed`)
})

txConciliationWorker.on('failed', (job, err) => {
  txConciliationLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message })
})

export const webhookWorker = new Worker(
  'webhook',
  async job => {
    const mod = await import('../../../../contexts/conciliation/application/NotifyWebhookUseCase.js')
    await new mod.NotifyWebhookUseCase().execute(job.data)
  },
  { connection: redis }
)

webhookWorker.on('completed', job => {
  webhookLog.info(`job ${job.id} completed`)
})

webhookWorker.on('failed', (job, err) => {
  webhookLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message })
})

export const bankMovementWebhookWorker = new Worker(
  'bank-movement-webhook',
  async job => {
    const mod = await import('../../../../contexts/banking/application/NotifyBankMovementUseCase.js')
    await new mod.NotifyBankMovementUseCase().execute(job.data)
  },
  { connection: redis }
)

bankMovementWebhookWorker.on('completed', job => {
  bankMovementWebhookLog.info(`job ${job.id} completed`)
})

bankMovementWebhookWorker.on('failed', (job, err) => {
  bankMovementWebhookLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message })
})
