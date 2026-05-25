import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface QueueOpts {
  connection: unknown
  defaultJobOptions: {
    attempts: number
    backoff: { type: string; delay: number }
    removeOnComplete: boolean
    removeOnFail: number
  }
}

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
      const opts = call[1] as QueueOpts | undefined
      expect(opts).toBeDefined()
      expect(opts!.connection).toBe(mod.redis)
      expect(opts!.defaultJobOptions).toEqual({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      })
    }
  })
})
