import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface QueueOpts {
  connection: unknown
  defaultJobOptions: {
    attempts: number
    backoff: { type: string; delay: number }
    removeOnComplete: boolean
    removeOnFail: number | boolean
  }
}

const WEBHOOK_QUEUES = new Set(['webhook', 'bank-movement-webhook'])

const QueueCtor = vi.fn(function (this: unknown, name: string, _opts?: QueueOpts) {
  return { name }
})
const RedisCtor = vi.fn(function (this: unknown) {
  return { kind: 'redis' }
})

vi.mock('bullmq', () => ({ Queue: QueueCtor }))
vi.mock('ioredis', () => ({ Redis: RedisCtor }))

describe('QueueRegistry', () => {
  const originalRedisUrl = process.env.REDIS_URL

  beforeEach(() => {
    vi.resetModules()
    QueueCtor.mockClear()
    RedisCtor.mockClear()
  })

  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = originalRedisUrl
    vi.unstubAllEnvs()
  })

  it('throws when REDIS_URL is not set', async () => {
    vi.stubEnv('REDIS_URL', '')
    await expect(import('./QueueRegistry.js')).rejects.toThrow('REDIS_URL is required')
  })

  it('constructs redis and all named queues', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
    const mod = await import('./QueueRegistry.js')

    expect(RedisCtor).toHaveBeenCalledWith('redis://localhost:6379', { maxRetriesPerRequest: null })
    expect(mod.redis).toBeDefined()

    const queueNames = QueueCtor.mock.calls.map((c) => c[0])
    expect(queueNames).toEqual(
      expect.arrayContaining([
        'order-ingestion',
        'bank-scrape',
        'conciliation',
        'tx-conciliation',
        'webhook',
        'bank-movement-webhook',
      ]),
    )
    expect(mod.Queues.orderIngestion).toBeDefined()
    expect(mod.Queues.bankScrape).toBeDefined()
    expect(mod.Queues.conciliation).toBeDefined()
    expect(mod.Queues.txConciliation).toBeDefined()
    expect(mod.Queues.webhook).toBeDefined()
    expect(mod.Queues.bankMovementWebhook).toBeDefined()

    for (const call of QueueCtor.mock.calls) {
      const name = call[0] as string
      const opts = call[1] as QueueOpts | undefined
      expect(opts).toBeDefined()
      expect(opts!.connection).toBe(mod.redis)
      if (WEBHOOK_QUEUES.has(name)) {
        // Webhook queues retry far longer and keep failed jobs for dead-lettering.
        expect(opts!.defaultJobOptions).toEqual({
          attempts: 12,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: true,
          removeOnFail: false,
        })
      } else {
        expect(opts!.defaultJobOptions).toEqual({
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: 100,
        })
      }
    }
  })

  it('honors WEBHOOK_QUEUE_ATTEMPTS and WEBHOOK_QUEUE_BACKOFF_MS overrides', async () => {
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
    vi.stubEnv('WEBHOOK_QUEUE_ATTEMPTS', '5')
    vi.stubEnv('WEBHOOK_QUEUE_BACKOFF_MS', '2000')
    await import('./QueueRegistry.js')

    const webhookCall = QueueCtor.mock.calls.find((c) => c[0] === 'bank-movement-webhook')
    const opts = webhookCall![1] as QueueOpts
    expect(opts.defaultJobOptions.attempts).toBe(5)
    expect(opts.defaultJobOptions.backoff.delay).toBe(2000)
  })
})
