import { Worker } from 'bullmq'
import { redis } from '../QueueRegistry.js'

export const conciliationWorker = new Worker(
  'conciliation',
  async job => {
    const mod = await import('../../../../contexts/conciliation/application/RunConciliationUseCase.js')
    await new mod.RunConciliationUseCase().execute(job.data)
  },
  { connection: redis }
)

conciliationWorker.on('completed', job => {
  console.log(`[conciliation] job ${job.id} completed`)
})

conciliationWorker.on('failed', (job, err) => {
  console.error(`[conciliation] job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
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
  console.log(`[tx-conciliation] job ${job.id} completed`)
})

txConciliationWorker.on('failed', (job, err) => {
  console.error(`[tx-conciliation] job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
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
  console.log(`[webhook] job ${job.id} completed`)
})

webhookWorker.on('failed', (job, err) => {
  console.error(`[webhook] job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
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
  console.log(`[bank-movement-webhook] job ${job.id} completed`)
})

bankMovementWebhookWorker.on('failed', (job, err) => {
  console.error(`[bank-movement-webhook] job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
})
