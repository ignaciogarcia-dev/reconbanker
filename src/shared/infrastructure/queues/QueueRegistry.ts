import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required')

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: 100,
}

// Webhook deliveries hit third-party endpoints that can be down for minutes or
// hours, so they retry far longer than the in-process default: ~12 attempts on
// exponential backoff from 10s spans roughly 6 hours. Failed jobs are kept
// (removeOnFail: false) so the worker's `failed` handler can dead-letter the
// final attempt; the durable record then lives in webhook_dead_letters.
const webhookJobOptions = {
  attempts: Number(process.env.WEBHOOK_QUEUE_ATTEMPTS ?? 12),
  backoff: { type: 'exponential' as const, delay: Number(process.env.WEBHOOK_QUEUE_BACKOFF_MS ?? 10_000) },
  removeOnComplete: true,
  removeOnFail: false,
}

export const Queues = {
  orderIngestion: new Queue('order-ingestion', { connection: redis, defaultJobOptions }),
  bankScrape:     new Queue('bank-scrape',     { connection: redis, defaultJobOptions }),
  conciliation:   new Queue('conciliation',    { connection: redis, defaultJobOptions }),
  txConciliation: new Queue('tx-conciliation', { connection: redis, defaultJobOptions }),
  webhook:        new Queue('webhook',         { connection: redis, defaultJobOptions: webhookJobOptions }),
  bankMovementWebhook: new Queue('bank-movement-webhook', { connection: redis, defaultJobOptions: webhookJobOptions }),
}
