import { describe, it, expect, vi } from 'vitest'
import { Redis } from 'ioredis'
import type { SystemEvent } from './events.js'

// The shared singleton imports a live Redis client at module load; stub it so unit tests never connect.
vi.mock('../queues/QueueRegistry.js', () => ({ redis: {} }))

const { RealtimeBus } = await import('./RealtimeBus.js')

const event: SystemEvent = {
  type: 'assistance.requested', userId: 'u-1', accountId: 'acc-1', occurredAt: '2026-01-01T00:00:00Z',
}

// A duplicated connection mock. Methods default to inert resolved values; tests override per case.
function makeConn(overrides: Record<string, unknown> = {}) {
  return {
    psubscribe: vi.fn(async () => undefined),
    on: vi.fn(),
    quit: vi.fn(async () => 'OK'),
    xgroup: vi.fn(async () => 'OK'),
    xreadgroup: vi.fn(async () => null),
    xack: vi.fn(async () => 1),
    xautoclaim: vi.fn(async () => null),
    del: vi.fn(async () => 1),
    ...overrides,
  }
}

// The injected primary connection whose duplicate() yields the per-operation connection.
function makeBus(conn: ReturnType<typeof makeConn>, primary: Record<string, unknown> = {}) {
  const injected = {
    publish: vi.fn(async () => 1),
    xadd: vi.fn(async () => '1-0'),
    duplicate: vi.fn(() => conn),
    ...primary,
  } as unknown as Redis
  return { bus: new RealtimeBus(injected), injected: injected as unknown as Record<string, ReturnType<typeof vi.fn>> }
}

describe('RealtimeBus', () => {
  it('publishes user events as JSON on the user channel', async () => {
    const { bus, injected } = makeBus(makeConn())
    await bus.publishUserEvent(event)
    expect(injected.publish).toHaveBeenCalledWith('events:user:u-1', JSON.stringify(event))
  })

  it('subscribes to all user channels and forwards parsed events, dropping malformed ones', async () => {
    const conn = makeConn()
    const { bus } = makeBus(conn)
    const onEvent = vi.fn()
    const dispose = bus.subscribeAllUserEvents(onEvent)

    expect(conn.psubscribe).toHaveBeenCalledWith('events:user:*')
    const handler = conn.on.mock.calls[0][1] as (p: string, c: string, m: string) => void
    handler('p', 'c', JSON.stringify(event))
    handler('p', 'c', 'not-json{')
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(event)

    await dispose()
    expect(conn.quit).toHaveBeenCalled()
  })

  it('tolerates a quit failure when disposing the subscriber', async () => {
    const conn = makeConn({ quit: vi.fn(async () => { throw new Error('redis down') }) })
    const { bus } = makeBus(conn)
    const dispose = bus.subscribeAllUserEvents(vi.fn())
    await expect(dispose()).resolves.toBeUndefined()
  })

  describe('openOtpWaiter', () => {
    it('creates the group and returns a submitted code', async () => {
      const conn = makeConn({
        xreadgroup: vi.fn(async () => [['otp:req:req-1', [['1-0', ['code', '123456']]]]]),
      })
      const { bus } = makeBus(conn)
      const waiter = await bus.openOtpWaiter('req-1')

      expect(conn.xgroup).toHaveBeenCalledWith('CREATE', 'otp:req:req-1', 'otp', '0', 'MKSTREAM')
      expect(await waiter.next(10)).toBe('123456')
      expect(conn.xack).toHaveBeenCalled()

      await waiter.close()
      expect(conn.del).toHaveBeenCalledWith('otp:req:req-1')
      expect(conn.quit).toHaveBeenCalled()
    })

    it('still returns the code when the ack fails and tolerates cleanup errors on close', async () => {
      const reject = vi.fn(async () => { throw new Error('redis down') })
      const conn = makeConn({
        xreadgroup: vi.fn(async () => [['otp:req:req-1', [['1-0', ['code', '123456']]]]]),
        xack: reject,
        del: reject,
        quit: reject,
      })
      const { bus } = makeBus(conn)
      const waiter = await bus.openOtpWaiter('req-1')
      expect(await waiter.next(10)).toBe('123456')
      await expect(waiter.close()).resolves.toBeUndefined()
    })

    it('returns null when the window elapses with no code', async () => {
      const conn = makeConn({ xreadgroup: vi.fn(async () => null) })
      const { bus } = makeBus(conn)
      const waiter = await bus.openOtpWaiter('req-1')
      expect(await waiter.next(10)).toBeNull()
    })

    it('returns null when fields contain no code key', async () => {
      const conn = makeConn({
        xreadgroup: vi.fn(async () => [['otp:req:req-1', [['1-0', ['other', 'x']]]]]),
      })
      const { bus } = makeBus(conn)
      const waiter = await bus.openOtpWaiter('req-1')
      expect(await waiter.next(10)).toBeNull()
    })

    it('swallows a BUSYGROUP error but rethrows other group errors', async () => {
      const busy = makeConn({ xgroup: vi.fn(async () => { throw new Error('BUSYGROUP exists') }) })
      const { bus: b1 } = makeBus(busy)
      await expect(b1.openOtpWaiter('req-1')).resolves.toBeDefined()

      const fatal = makeConn({ xgroup: vi.fn(async () => { throw new Error('CONNRESET') }) })
      const { bus: b2 } = makeBus(fatal)
      await expect(b2.openOtpWaiter('req-1')).rejects.toThrow('CONNRESET')
    })
  })

  it('submits an OTP code with a capped stream', async () => {
    const { bus, injected } = makeBus(makeConn())
    await bus.submitOtp('req-1', '999')
    expect(injected.xadd).toHaveBeenCalledWith('otp:req:req-1', 'MAXLEN', '~', 5, '*', 'code', '999')
  })

  it('enqueues a notification onto the notify stream', async () => {
    const { bus, injected } = makeBus(makeConn())
    await bus.enqueueNotification(event)
    expect(injected.xadd).toHaveBeenCalledWith('notify-stream', 'MAXLEN', '~', 5_000, '*', 'event', JSON.stringify(event))
  })

  describe('consumeNotifications', () => {
    it('processes claimed and freshly read entries then acks each', async () => {
      const signal = { stopped: false }
      const handler = vi.fn(async () => { signal.stopped = true })
      const conn = makeConn({
        xautoclaim: vi.fn(async () => ['0-0', [['1-0', ['event', JSON.stringify(event)]]], []]),
        xreadgroup: vi.fn(async () => [['notify-stream', [['2-0', ['event', JSON.stringify(event)]]]]]),
      })
      const { bus } = makeBus(conn)

      await bus.consumeNotifications('c-1', handler, signal)

      expect(handler).toHaveBeenCalledTimes(2)
      expect(conn.xack).toHaveBeenCalledTimes(2)
      expect(conn.quit).toHaveBeenCalled()
    })

    it('leaves an entry un-acked when the handler throws', async () => {
      const signal = { stopped: false }
      const handler = vi.fn(async () => { signal.stopped = true; throw new Error('handler boom') })
      const conn = makeConn({
        xreadgroup: vi.fn(async () => [['notify-stream', [['2-0', ['event', JSON.stringify(event)]]]]]),
      })
      const { bus } = makeBus(conn)

      await bus.consumeNotifications('c-1', handler, signal)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(conn.xack).not.toHaveBeenCalled()
    })

    it('tolerates redis cleanup failures while still delivering and stopping', async () => {
      const signal = { stopped: false }
      const handler = vi.fn(async () => { signal.stopped = true })
      const reject = vi.fn(async () => { throw new Error('redis down') })
      const conn = makeConn({
        xautoclaim: reject, // swallowed to null -> no claimed entries
        xreadgroup: vi.fn(async () => [['notify-stream', [['2-0', ['event', JSON.stringify(event)]]]]]),
        xack: reject,       // ack failure swallowed
        quit: reject,       // finally quit failure swallowed
      })
      const { bus } = makeBus(conn)

      await expect(bus.consumeNotifications('c-1', handler, signal)).resolves.toBeUndefined()
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('skips empty reads and acks entries without an event field', async () => {
      const signal = { stopped: false }
      let reads = 0
      const conn = makeConn({
        xreadgroup: vi.fn(async () => {
          reads += 1
          if (reads === 1) return null // empty read -> continue
          signal.stopped = true
          return [['notify-stream', [['3-0', ['other', 'x']]]]] // no event field -> ack without handler
        }),
      })
      const handler = vi.fn(async () => {})
      const { bus } = makeBus(conn)

      await bus.consumeNotifications('c-1', handler, signal)

      expect(handler).not.toHaveBeenCalled()
      expect(conn.xack).toHaveBeenCalledTimes(1)
    })
  })
})
