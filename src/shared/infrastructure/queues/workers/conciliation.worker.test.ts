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
    requestRepository: { findById: vi.fn(async () => ({ id: 'req-1', accountId: 'acc-1' })) },
  }
  const banking = {
    notifyBankMovement: { execute: vi.fn(async () => {}) },
    bankTransactionRepository: { findById: vi.fn(async () => ({ id: 'tx-1', accountId: 'acc-1' })) },
  }
  const webhookDeadLetters = { record: vi.fn(async () => {}), markResolved: vi.fn(async () => {}) }
  return {
    container: { logger, conciliation, banking, webhookDeadLetters } as never,
    childLogs,
    conciliation,
    banking,
    webhookDeadLetters,
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
    expect(conciliation.notifyWebhook.execute).toHaveBeenCalledWith({ c: 3, attempt: 1 })

    await created[3].processor({ data: { d: 4 }, attemptsMade: 1 })
    expect(banking.notifyBankMovement.execute).toHaveBeenCalledWith({ d: 4, attempt: 2 })

    // Non-webhook workers still just log their events
    const conciliationLog = childLogs.get('[conciliation]')!
    await created[0].handlers.get('completed')!({ id: 'c1' })
    expect(conciliationLog.info).toHaveBeenCalledWith('job c1 completed')
    await created[0].handlers.get('failed')!({ id: 'c1', attemptsMade: 2 }, new Error('e1'))
    expect(conciliationLog.error).toHaveBeenCalledWith('job c1 failed (attempt 2)', { error: 'e1', stack: expect.any(String) })
    await created[0].handlers.get('failed')!(undefined, new Error('e2'))
    expect(conciliationLog.error).toHaveBeenCalledWith('job undefined failed (attempt undefined)', { error: 'e2', stack: expect.any(String) })

    const txLog = childLogs.get('[tx-conciliation]')!
    await created[1].handlers.get('completed')!({ id: 't1' })
    expect(txLog.info).toHaveBeenCalledWith('job t1 completed')
    await created[1].handlers.get('failed')!({ id: 't1', attemptsMade: 1 }, new Error('te'))
    expect(txLog.error).toHaveBeenCalledWith('job t1 failed (attempt 1)', { error: 'te', stack: expect.any(String) })
  })

  it('dead-letters a bank-movement webhook only on its final attempt', async () => {
    const { container, banking, webhookDeadLetters } = makeContainer()
    createConciliationWorkers(container)
    const failed = created[3].handlers.get('failed')!

    // Not exhausted yet (attemptsMade < attempts): no dead-letter.
    await failed({ id: 'b1', data: { bankTransactionId: 'tx-1' }, attemptsMade: 3, opts: { attempts: 12 } }, new Error('boom'))
    expect(webhookDeadLetters.record).not.toHaveBeenCalled()

    // Final attempt: dead-letter with the looked-up subject and last status.
    const err = Object.assign(new Error('Webhook failed: 500'), { status: 500 })
    await failed({ id: 'b1', data: { bankTransactionId: 'tx-1' }, attemptsMade: 12, opts: { attempts: 12 } }, err)
    expect(banking.bankTransactionRepository.findById).toHaveBeenCalledWith('tx-1')
    expect(webhookDeadLetters.record).toHaveBeenCalledWith({
      accountId: 'acc-1',
      subjectType: 'bank_transaction',
      subjectId: 'tx-1',
      url: null,
      lastStatus: 500,
      lastError: 'Webhook failed: 500',
      attempts: 12,
    })
  })

  it('records null lastStatus on a transport failure (no HTTP status)', async () => {
    const { container, webhookDeadLetters } = makeContainer()
    createConciliationWorkers(container)
    const failed = created[3].handlers.get('failed')!

    await failed({ id: 'b1', data: { bankTransactionId: 'tx-1' }, attemptsMade: 12, opts: { attempts: 12 } }, new Error('connect ECONNREFUSED'))
    expect(webhookDeadLetters.record).toHaveBeenCalledWith(expect.objectContaining({ lastStatus: null, lastError: 'connect ECONNREFUSED' }))
  })

  it('resolves the dead-letter when a bank-movement webhook completes', async () => {
    const { container, webhookDeadLetters } = makeContainer()
    createConciliationWorkers(container)

    await created[3].handlers.get('completed')!({ id: 'b1', data: { bankTransactionId: 'tx-1' } })
    expect(webhookDeadLetters.markResolved).toHaveBeenCalledWith('bank_transaction', 'tx-1')
  })

  it('dead-letters and resolves conciliation webhooks symmetrically', async () => {
    const { container, conciliation, webhookDeadLetters } = makeContainer()
    createConciliationWorkers(container)

    await created[2].handlers.get('failed')!({ id: 'w1', data: { requestId: 'req-1' }, attemptsMade: 12, opts: { attempts: 12 } }, new Error('we'))
    expect(conciliation.requestRepository.findById).toHaveBeenCalledWith('req-1')
    expect(webhookDeadLetters.record).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'acc-1', subjectType: 'conciliation_request', subjectId: 'req-1', attempts: 12,
    }))

    await created[2].handlers.get('completed')!({ id: 'w1', data: { requestId: 'req-1' } })
    expect(webhookDeadLetters.markResolved).toHaveBeenCalledWith('conciliation_request', 'req-1')
  })
})
