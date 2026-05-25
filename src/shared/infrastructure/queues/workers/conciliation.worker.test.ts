import { describe, it, expect, vi, beforeEach } from 'vitest'

type Handler = (...args: unknown[]) => unknown

interface WorkerStub {
  name: string
  processor: Handler
  opts: unknown
  handlers: Map<string, Handler>
  on: (event: string, handler: Handler) => void
}

const created: WorkerStub[] = []

const WorkerCtor = vi.fn(function (this: unknown, name: string, processor: Handler, opts: unknown) {
  const stub: WorkerStub = {
    name,
    processor,
    opts,
    handlers: new Map(),
    on(event: string, handler: Handler) { this.handlers.set(event, handler) },
  }
  created.push(stub)
  return stub
})

vi.mock('bullmq', () => ({
  Worker: WorkerCtor,
}))

vi.mock('../QueueRegistry.js', () => ({
  redis: { kind: 'fake-redis' },
}))

const { createConciliationWorkers } = await import('./conciliation.worker.js')

function makeContainer() {
  const childLogs = new Map<string, { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; child: ReturnType<typeof vi.fn> }>()
  const logger = {
    child: vi.fn((ctx: string) => {
      const c = {
        debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
        child: vi.fn(),
      }
      c.child.mockReturnValue(c)
      childLogs.set(ctx, c)
      return c
    }),
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }
  const conciliation = {
    runConciliation: { execute: vi.fn(async () => {}) },
    processIncomingTransaction: { execute: vi.fn(async () => {}) },
    notifyWebhook: { execute: vi.fn(async () => {}) },
  }
  const banking = {
    notifyBankMovement: { execute: vi.fn(async () => {}) },
  }
  return {
    container: { logger, conciliation, banking } as never,
    childLogs,
    conciliation,
    banking,
  }
}

describe('createConciliationWorkers', () => {
  beforeEach(() => {
    created.length = 0
    WorkerCtor.mockClear()
  })

  it('creates 4 workers wired to the right use cases', async () => {
    const { container, childLogs, conciliation, banking } = makeContainer()
    const workers = createConciliationWorkers(container)

    expect(workers.conciliationWorker).toBeDefined()
    expect(workers.txConciliationWorker).toBeDefined()
    expect(workers.webhookWorker).toBeDefined()
    expect(workers.bankMovementWebhookWorker).toBeDefined()
    expect(created.map(c => c.name)).toEqual([
      'conciliation', 'tx-conciliation', 'webhook', 'bank-movement-webhook',
    ])

    // Each processor calls its use case
    await created[0].processor({ data: { a: 1 } })
    expect(conciliation.runConciliation.execute).toHaveBeenCalledWith({ a: 1 })

    await created[1].processor({ data: { b: 2 } })
    expect(conciliation.processIncomingTransaction.execute).toHaveBeenCalledWith({ b: 2 })

    await created[2].processor({ data: { c: 3 } })
    expect(conciliation.notifyWebhook.execute).toHaveBeenCalledWith({ c: 3 })

    await created[3].processor({ data: { d: 4 } })
    expect(banking.notifyBankMovement.execute).toHaveBeenCalledWith({ d: 4 })

    // Event handlers
    const conciliationLog = childLogs.get('[conciliation]')!
    created[0].handlers.get('completed')!({ id: 'c1' })
    expect(conciliationLog.info).toHaveBeenCalledWith('job c1 completed')
    created[0].handlers.get('failed')!({ id: 'c1', attemptsMade: 2 }, new Error('e1'))
    expect(conciliationLog.error).toHaveBeenCalledWith('job c1 failed (attempt 2)', { error: 'e1' })
    // failed with undefined job
    created[0].handlers.get('failed')!(undefined, new Error('e2'))
    expect(conciliationLog.error).toHaveBeenCalledWith('job undefined failed (attempt undefined)', { error: 'e2' })

    const txLog = childLogs.get('[tx-conciliation]')!
    created[1].handlers.get('completed')!({ id: 't1' })
    expect(txLog.info).toHaveBeenCalledWith('job t1 completed')
    created[1].handlers.get('failed')!({ id: 't1', attemptsMade: 1 }, new Error('te'))
    expect(txLog.error).toHaveBeenCalledWith('job t1 failed (attempt 1)', { error: 'te' })

    const webhookLog = childLogs.get('[webhook]')!
    created[2].handlers.get('completed')!({ id: 'w1' })
    expect(webhookLog.info).toHaveBeenCalledWith('job w1 completed')
    created[2].handlers.get('failed')!({ id: 'w1', attemptsMade: 3 }, new Error('we'))
    expect(webhookLog.error).toHaveBeenCalledWith('job w1 failed (attempt 3)', { error: 'we' })

    const bmwLog = childLogs.get('[bank-movement-webhook]')!
    created[3].handlers.get('completed')!({ id: 'b1' })
    expect(bmwLog.info).toHaveBeenCalledWith('job b1 completed')
    created[3].handlers.get('failed')!({ id: 'b1', attemptsMade: 4 }, new Error('be'))
    expect(bmwLog.error).toHaveBeenCalledWith('job b1 failed (attempt 4)', { error: 'be' })
  })
})
