import { Worker } from 'bullmq'
import type { Job } from 'bullmq'
import { redis } from '../QueueRegistry.js'
import type { Container } from '../../../../composition/container.js'
import type { WebhookError } from '../../webhooks/WebhookSender.js'
import type { ILogger } from '../../../logger/ILogger.js'

export interface ConciliationWorkers {
  conciliationWorker: Worker
  txConciliationWorker: Worker
  webhookWorker: Worker
  bankMovementWebhookWorker: Worker
}

/** True only on the attempt that exhausts the queue's retry budget. */
function isFinalFailure(job: Job | undefined): boolean {
  if (!job) return false
  return job.attemptsMade >= (job.opts?.attempts ?? 1)
}

function lastStatusOf(err: Error): number | null {
  const status = (err as Partial<WebhookError>).status
  return typeof status === 'number' ? status : null
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
    conciliationLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message, stack: err.stack })
  )

  const txConciliationWorker = new Worker(
    'tx-conciliation',
    async (job) => { await conciliation.processIncomingTransaction.execute(job.data) },
    { connection: redis }
  )
  txConciliationWorker.on('completed', (job) => txConciliationLog.info(`job ${job.id} completed`))
  txConciliationWorker.on('failed', (job, err) =>
    txConciliationLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message, stack: err.stack })
  )

  const webhookWorker = new Worker(
    'webhook',
    async (job) => { await conciliation.notifyWebhook.execute({ ...job.data, attempt: (job.attemptsMade ?? 0) + 1 }) },
    { connection: redis }
  )
  webhookWorker.on('completed', async (job) => {
    webhookLog.info(`job ${job.id} completed`)
    await resolveDeadLetter(
      () => container.webhookDeadLetters.markResolved('conciliation_request', job.data.requestId),
      webhookLog,
    )
  })
  webhookWorker.on('failed', async (job, err) => {
    webhookLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message, stack: err.stack })
    if (!isFinalFailure(job)) return
    await deadLetter(webhookLog, async () => {
      const request = await container.conciliation.requestRepository.findById(job!.data.requestId)
      if (!request) return null
      return {
        accountId: request.accountId,
        subjectType: 'conciliation_request' as const,
        subjectId: request.id,
        url: null,
        lastStatus: lastStatusOf(err),
        lastError: err.message,
        attempts: job!.attemptsMade,
      }
    })
  })

  const bankMovementWebhookWorker = new Worker(
    'bank-movement-webhook',
    async (job) => { await container.banking.notifyBankMovement.execute({ ...job.data, attempt: (job.attemptsMade ?? 0) + 1 }) },
    { connection: redis }
  )
  bankMovementWebhookWorker.on('completed', async (job) => {
    bankMovementWebhookLog.info(`job ${job.id} completed`)
    await resolveDeadLetter(
      () => container.webhookDeadLetters.markResolved('bank_transaction', job.data.bankTransactionId),
      bankMovementWebhookLog,
    )
  })
  bankMovementWebhookWorker.on('failed', async (job, err) => {
    bankMovementWebhookLog.error(`job ${job?.id} failed (attempt ${job?.attemptsMade})`, { error: err.message, stack: err.stack })
    if (!isFinalFailure(job)) return
    await deadLetter(bankMovementWebhookLog, async () => {
      const tx = await container.banking.bankTransactionRepository.findById(job!.data.bankTransactionId)
      if (!tx) return null
      return {
        accountId: tx.accountId,
        subjectType: 'bank_transaction' as const,
        subjectId: tx.id,
        url: null,
        lastStatus: lastStatusOf(err),
        lastError: err.message,
        attempts: job!.attemptsMade,
      }
    })
  })

  // Recording the dead-letter happens inside a fire-and-forget BullMQ event
  // handler, so a transient DB error must not crash the worker. The partial
  // unique index makes the upsert safe under at-least-once delivery.
  async function deadLetter(
    workerLog: ILogger,
    build: () => Promise<Parameters<Container['webhookDeadLetters']['record']>[0] | null>,
  ): Promise<void> {
    try {
      const entry = await build()
      if (entry) await container.webhookDeadLetters.record(entry)
    } catch (e) {
      workerLog.error('dead-letter record failed', { error: (e as Error).message })
    }
  }

  async function resolveDeadLetter(run: () => Promise<void>, workerLog: ILogger): Promise<void> {
    try {
      await run()
    } catch (e) {
      workerLog.error('dead-letter resolve failed', { error: (e as Error).message })
    }
  }

  return { conciliationWorker, txConciliationWorker, webhookWorker, bankMovementWebhookWorker }
}
