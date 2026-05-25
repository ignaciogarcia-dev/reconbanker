import { describe, it, expect, vi } from 'vitest'
import { InMemoryEventBus } from './InMemoryEventBus.js'
import type { DomainEvent } from './DomainEvent.js'

const evt = (type: string): DomainEvent => ({
  eventType: type,
  occurredAt: new Date(),
  aggregateId: 'agg-1',
})

describe('InMemoryEventBus', () => {
  it('delivers an event to all subscribed handlers', async () => {
    const bus = new InMemoryEventBus()
    const a = vi.fn().mockResolvedValue(undefined)
    const b = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('Foo', a)
    bus.subscribe('Foo', b)
    await bus.publish(evt('Foo'))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('does not throw when a handler rejects and still calls others', async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }
    log.child.mockReturnValue(log as any)
    const bus = new InMemoryEventBus(log as any)
    const a = vi.fn().mockRejectedValue(new Error('bad'))
    const b = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('Foo', a)
    bus.subscribe('Foo', b)
    await expect(bus.publish(evt('Foo'))).resolves.toBeUndefined()
    expect(b).toHaveBeenCalled()
    expect(log.error).toHaveBeenCalled()
  })

  it('ignores events with no subscribers', async () => {
    const bus = new InMemoryEventBus()
    await expect(bus.publish(evt('Nobody'))).resolves.toBeUndefined()
  })

  it('publishAll publishes each event', async () => {
    const bus = new InMemoryEventBus()
    const h = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('X', h)
    await bus.publishAll([evt('X'), evt('X'), evt('Y')])
    expect(h).toHaveBeenCalledTimes(2)
  })

  it('stringifies non-Error rejection reasons before logging', async () => {
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }
    log.child.mockReturnValue(log as any)
    const bus = new InMemoryEventBus(log as any)
    bus.subscribe('Foo', () => Promise.reject('plain string failure'))
    await bus.publish(evt('Foo'))
    expect(log.error).toHaveBeenCalledWith('event handler failed', expect.objectContaining({
      error: 'plain string failure',
    }))
  })
})
