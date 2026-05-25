import { describe, it, expect, vi, beforeEach } from 'vitest'

type Handler = (...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

const WorkerCtor = vi.fn(function (this: unknown, name: string, processor: Handler, opts: unknown) {
  return {
    name, processor, opts,
    on: vi.fn((event: string, h: Handler) => { handlers.set(event, h) }),
  }
})

vi.mock('bullmq', () => ({
  Worker: WorkerCtor,
}))

vi.mock('../QueueRegistry.js', () => ({
  redis: { kind: 'fake-redis' },
}))

const { createOrderIngestionWorker } = await import('./order-ingestion.worker.js')

function makeContainer() {
  const child = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    child: vi.fn(),
  }
  child.child.mockReturnValue(child)
  const pollExecute = vi.fn(async () => {})
  return {
    container: {
      logger: { child: vi.fn(() => child) },
      conciliation: { pollPendingOrders: { execute: pollExecute } },
    } as never,
    log: child,
    pollExecute,
  }
}

describe('createOrderIngestionWorker', () => {
  beforeEach(() => {
    handlers.clear()
    WorkerCtor.mockClear()
  })

  it('creates the worker with correct queue name and connection', () => {
    const { container } = makeContainer()
    createOrderIngestionWorker(container)
    expect(WorkerCtor).toHaveBeenCalledWith(
      'order-ingestion',
      expect.any(Function),
      { connection: { kind: 'fake-redis' } }
    )
  })

  it('processor calls pollPendingOrders and logs success', async () => {
    const { container, log, pollExecute } = makeContainer()
    createOrderIngestionWorker(container)
    const processor = WorkerCtor.mock.calls[0][1] as (job: unknown) => Promise<void>
    await processor({ id: 'o1', data: { x: 1 } })
    expect(pollExecute).toHaveBeenCalledWith({ x: 1 })
    expect(log.info).toHaveBeenCalledWith('starting job o1', { jobData: { x: 1 } })
    expect(log.info).toHaveBeenCalledWith('job o1 completed')
  })

  it('processor logs and rethrows Error failures', async () => {
    const { container, log } = makeContainer()
    const pollExecute = vi.fn().mockRejectedValue(new Error('boom'))
    ;(container as { conciliation: { pollPendingOrders: { execute: typeof pollExecute } } }).conciliation.pollPendingOrders.execute = pollExecute
    createOrderIngestionWorker(container)
    const processor = WorkerCtor.mock.calls[0][1] as (job: unknown) => Promise<void>
    await expect(processor({ id: 'o2', data: {} })).rejects.toThrow('boom')
    expect(log.error).toHaveBeenCalledWith('job o2 failed', { error: 'boom' })
  })

  it('processor stringifies non-Error failures', async () => {
    const { container, log } = makeContainer()
    const pollExecute = vi.fn().mockRejectedValue('weird')
    ;(container as { conciliation: { pollPendingOrders: { execute: typeof pollExecute } } }).conciliation.pollPendingOrders.execute = pollExecute
    createOrderIngestionWorker(container)
    const processor = WorkerCtor.mock.calls[0][1] as (job: unknown) => Promise<void>
    await expect(processor({ id: 'o3', data: {} })).rejects.toBe('weird')
    expect(log.error).toHaveBeenCalledWith('job o3 failed', { error: 'weird' })
  })

  it('registers a failed handler that logs', () => {
    const { container, log } = makeContainer()
    createOrderIngestionWorker(container)
    const failed = handlers.get('failed')!
    failed({ id: 'o4' }, new Error('whoops'))
    expect(log.error).toHaveBeenCalledWith('worker failed event', { jobId: 'o4', error: 'whoops' })
    failed(undefined, new Error('nojob'))
    expect(log.error).toHaveBeenCalledWith('worker failed event', { jobId: undefined, error: 'nojob' })
  })
})
