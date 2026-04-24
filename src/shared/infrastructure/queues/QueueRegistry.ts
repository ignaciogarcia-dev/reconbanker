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

export const Queues = {
  orderIngestion: new Queue('order-ingestion', { connection: redis, defaultJobOptions }),
  bankScrape:     new Queue('bank-scrape',     { connection: redis, defaultJobOptions }),
  conciliation:   new Queue('conciliation',    { connection: redis, defaultJobOptions }),
  txConciliation: new Queue('tx-conciliation', { connection: redis, defaultJobOptions }),
  webhook:        new Queue('webhook',         { connection: redis, defaultJobOptions }),
  bankMovementWebhook: new Queue('bank-movement-webhook', { connection: redis, defaultJobOptions }),
}
