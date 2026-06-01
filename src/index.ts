import 'dotenv/config'
import './shared/config/runValidateEnv.js'
import { createServer } from './api/server.js'
import { buildContainer } from './composition/container.js'
import { createBankScrapeWorker } from './shared/infrastructure/queues/workers/bank-scrape.worker.js'
import { createConciliationWorkers } from './shared/infrastructure/queues/workers/conciliation.worker.js'
import { createOrderIngestionWorker } from './shared/infrastructure/queues/workers/order-ingestion.worker.js'
import { Scheduler } from './shared/infrastructure/queues/Scheduler.js'
import { TransactionIngestedEvent } from './shared/events/events/TransactionIngested.event.js'
import { ConciliationMatchedEvent } from './shared/events/events/ConciliationMatched.event.js'
import { Queues, redis } from './shared/infrastructure/queues/QueueRegistry.js'

const container = buildContainer({ redis })
const log = container.logger.child('[app]')

container.eventBus.subscribe<TransactionIngestedEvent>('TransactionIngested', (event) =>
  container.conciliation.onTransactionIngested.execute(event)
)

container.eventBus.subscribe<TransactionIngestedEvent>('TransactionIngested', async (event) => {
  await Queues.bankMovementWebhook.add(
    'notify',
    { bankTransactionId: event.aggregateId },
    { jobId: `bank-movement-webhook_${event.aggregateId}`, removeOnComplete: true }
  )
})

container.eventBus.subscribe<ConciliationMatchedEvent>('ConciliationMatched', async (event) => {
  await Queues.webhook.add(
    'notify',
    { requestId: event.aggregateId },
    { jobId: `webhook_${event.aggregateId}`, removeOnComplete: true }
  )
  log.info(`ConciliationMatched — webhook enqueued`, { aggregateId: event.aggregateId })
})

const orderIngestionWorker = createOrderIngestionWorker(container)
const bankScrapeWorker = createBankScrapeWorker(container)
const {
  conciliationWorker, txConciliationWorker, webhookWorker, bankMovementWebhookWorker,
} = createConciliationWorkers(container)

const PORT = process.env.PORT ?? 3000
const app = createServer(container)
const scheduler = new Scheduler(container)

app.listen(PORT, async () => {
  log.info(`server listening`, { port: PORT })
  await scheduler.start()
})

log.info('workers started', {
  workers: [
    orderIngestionWorker.name,
    bankScrapeWorker.name,
    conciliationWorker.name,
    txConciliationWorker.name,
    webhookWorker.name,
    bankMovementWebhookWorker.name,
  ].join(', ')
})

process.on('SIGTERM', async () => {
  scheduler.stop()
  container.banking.sessionManager.stopAll()
  await Promise.all([
    orderIngestionWorker.close(),
    bankScrapeWorker.close(),
    conciliationWorker.close(),
    txConciliationWorker.close(),
    webhookWorker.close(),
    bankMovementWebhookWorker.close(),
  ])
  process.exit(0)
})
