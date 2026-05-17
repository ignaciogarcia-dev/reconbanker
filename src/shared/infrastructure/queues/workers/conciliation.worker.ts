import { Worker } from 'bullmq'
import { redis } from '../QueueRegistry.js'
import type { Container } from '../../../../composition/container.js'

export interface ConciliationWorkers {
  conciliationWorker: Worker
  txConciliationWorker: Worker
  webhookWorker: Worker
  bankMovementWebhookWorker: Worker
}

export function createConciliationWorkers(container: Container): ConciliationWorkers {
  const { conciliation } = container
  const log = container.logger
  const conciliationLog = log.child('[conciliation]')
  const txConciliationLog = log.child('[tx-conciliation]')
  const webhookLog = log.child('[webhook]')
  const bankMovementWebhookLog = log.child('[bank-movement-webhook]')

  const conciliationWorker = new Worker(
    'conciliation',
    async (job) => { await conciliation.runConciliation.execute(job.data) },
    { connection: redis }
  )
  conciliationWorker.on('completed', (job) => conciliationLog.info(`job ${job.id} completed`))
  conciliationWorker.on('failed', (job, err) =>
    conciliationLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message })
  )

  const txConciliationWorker = new Worker(
    'tx-conciliation',
    async (job) => { await conciliation.processIncomingTransaction.execute(job.data) },
    { connection: redis }
  )
  txConciliationWorker.on('completed', (job) => txConciliationLog.info(`job ${job.id} completed`))
  txConciliationWorker.on('failed', (job, err) =>
    txConciliationLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message })
  )

  const webhookWorker = new Worker(
    'webhook',
    async (job) => { await conciliation.notifyWebhook.execute(job.data) },
    { connection: redis }
  )
  webhookWorker.on('completed', (job) => webhookLog.info(`job ${job.id} completed`))
  webhookWorker.on('failed', (job, err) =>
    webhookLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message })
  )

  const bankMovementWebhookWorker = new Worker(
    'bank-movement-webhook',
    async (job) => { await container.banking.notifyBankMovement.execute(job.data) },
    { connection: redis }
  )
  bankMovementWebhookWorker.on('completed', (job) => bankMovementWebhookLog.info(`job ${job.id} completed`))
  bankMovementWebhookWorker.on('failed', (job, err) =>
    bankMovementWebhookLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message })
  )

  return { conciliationWorker, txConciliationWorker, webhookWorker, bankMovementWebhookWorker }
}
