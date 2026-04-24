import 'dotenv/config'
import { createServer } from './api/server.js'
import { orderIngestionWorker } from './shared/infrastructure/queues/workers/order-ingestion.worker.js'
import { bankScrapeWorker } from './shared/infrastructure/queues/workers/bank-scrape.worker.js'
import { conciliationWorker, webhookWorker, bankMovementWebhookWorker } from './shared/infrastructure/queues/workers/conciliation.worker.js'
import { Scheduler } from './shared/infrastructure/queues/Scheduler.js'
import { EventBus } from './shared/events/EventBus.js'
import { TransactionIngestedEvent } from './shared/events/events/TransactionIngested.event.js'
import { ConciliationMatchedEvent } from './shared/events/events/ConciliationMatched.event.js'
import { Queues } from './shared/infrastructure/queues/QueueRegistry.js'
import { OnTransactionIngestedUseCase } from './contexts/conciliation/application/OnTransactionIngestedUseCase.js'

const onTransactionIngested = new OnTransactionIngestedUseCase()

// Decide whether to exclude or enqueue conciliation.
EventBus.subscribe<TransactionIngestedEvent>('TransactionIngested', async (event) => {
  await onTransactionIngested.execute(event)
})

// Passthrough notification — use case decides if mode applies.
EventBus.subscribe<TransactionIngestedEvent>('TransactionIngested', async (event) => {
  await Queues.bankMovementWebhook.add(
    'notify',
    { bankTransactionId: event.aggregateId },
    { jobId: `bank-movement-webhook_${event.aggregateId}`, removeOnComplete: true }
  )
})

// Notify webhook on match.
EventBus.subscribe<ConciliationMatchedEvent>('ConciliationMatched', async (event) => {
  await Queues.webhook.add(
    'notify',
    { requestId: event.aggregateId },
    { jobId: `webhook_${event.aggregateId}`, removeOnComplete: true }
  )
  console.log(`[EventBus] ConciliationMatched → webhook enqueued for ${event.aggregateId}`)
})

const PORT = process.env.PORT ?? 3000

const app = createServer()
const scheduler = new Scheduler()

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`)
  await scheduler.start()
})

console.log('Workers started:', [
  orderIngestionWorker.name,
  bankScrapeWorker.name,
  conciliationWorker.name,
  webhookWorker.name,
  bankMovementWebhookWorker.name,
].join(', '))

process.on('SIGTERM', async () => {
  scheduler.stop()
  await Promise.all([
    orderIngestionWorker.close(),
    bankScrapeWorker.close(),
    conciliationWorker.close(),
    webhookWorker.close(),
    bankMovementWebhookWorker.close(),
  ])
  process.exit(0)
})
