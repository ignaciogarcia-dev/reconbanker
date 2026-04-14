import 'dotenv/config'
import { createServer } from './api/server.js'
import { orderIngestionWorker } from './shared/infrastructure/queues/workers/order-ingestion.worker.js'
import { bankScrapeWorker } from './shared/infrastructure/queues/workers/bank-scrape.worker.js'
import { conciliationWorker, webhookWorker } from './shared/infrastructure/queues/workers/conciliation.worker.js'
import { Scheduler } from './shared/infrastructure/queues/Scheduler.js'
import { EventBus } from './shared/events/EventBus.js'
import { TransactionIngestedEvent } from './shared/events/events/TransactionIngested.event.js'
import { ConciliationMatchedEvent } from './shared/events/events/ConciliationMatched.event.js'
import { Queues } from './shared/infrastructure/queues/QueueRegistry.js'
import { db } from './shared/infrastructure/db/client.js'

// Cuando llega una transacción nueva → encolar conciliación de pendientes
EventBus.subscribe<TransactionIngestedEvent>('TransactionIngested', async (event) => {
  const { rows } = await db.query(
    `SELECT id FROM conciliation_requests
     WHERE account_id = $1
       AND status IN ('pending', 'not_found')
       AND created_at > now() - interval '5 days'`,
    [event.accountId]
  )

  for (const req of rows) {
    await Queues.conciliation.add(
      'run',
      { requestId: req.id },
      { jobId: `conciliation_${req.id}_${Date.now()}`, removeOnComplete: true }
    )
  }

  console.log(`[EventBus] TransactionIngested → enqueued ${rows.length} conciliation(s)`)
})

// Cuando hay un match → notificar webhook
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
].join(', '))

process.on('SIGTERM', async () => {
  scheduler.stop()
  await Promise.all([
    orderIngestionWorker.close(),
    bankScrapeWorker.close(),
    conciliationWorker.close(),
    webhookWorker.close(),
  ])
  process.exit(0)
})
