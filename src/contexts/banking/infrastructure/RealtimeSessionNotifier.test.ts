import { describe, it, expect, vi } from 'vitest'
import { RealtimeSessionNotifier } from './RealtimeSessionNotifier.js'
import type { RealtimeBus } from '../../../shared/infrastructure/realtime/RealtimeBus.js'

function makeBus() {
  return {
    publishUserEvent: vi.fn().mockResolvedValue(undefined),
    enqueueNotification: vi.fn().mockResolvedValue(undefined),
  }
}

describe('RealtimeSessionNotifier', () => {
  it('publishes needs_attention to the dashboard AND enqueues a webhook notification', () => {
    const bus = makeBus()
    const notifier = new RealtimeSessionNotifier(bus as unknown as RealtimeBus)

    notifier.emitNeedsAttention({ userId: 'u-1', accountId: 'acc-1', reason: 'auth_timeout' })

    expect(bus.publishUserEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.needs_attention', userId: 'u-1', accountId: 'acc-1', data: { reason: 'auth_timeout' },
    }))
    expect(bus.enqueueNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.needs_attention', data: { reason: 'auth_timeout' },
    }))
  })

  it('publishes started without enqueuing a webhook (dashboard-only)', () => {
    const bus = makeBus()
    const notifier = new RealtimeSessionNotifier(bus as unknown as RealtimeBus)

    notifier.emitStarted({ userId: 'u-1', accountId: 'acc-1' })

    expect(bus.publishUserEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.started' }))
    expect(bus.enqueueNotification).not.toHaveBeenCalled()
  })

  it('publishes stopped without enqueuing a webhook (dashboard-only)', () => {
    const bus = makeBus()
    const notifier = new RealtimeSessionNotifier(bus as unknown as RealtimeBus)

    notifier.emitStopped({ userId: 'u-1', accountId: 'acc-1', reason: 'stop_requested' })

    expect(bus.publishUserEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.stopped', data: { reason: 'stop_requested' },
    }))
    expect(bus.enqueueNotification).not.toHaveBeenCalled()
  })

  it('publishes recovered to the dashboard AND enqueues a webhook notification', () => {
    const bus = makeBus()
    const notifier = new RealtimeSessionNotifier(bus as unknown as RealtimeBus)

    notifier.emitRecovered({ userId: 'u-1', accountId: 'acc-1' })

    expect(bus.publishUserEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.recovered', userId: 'u-1', accountId: 'acc-1',
    }))
    expect(bus.enqueueNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.recovered',
    }))
  })

  it('publishes needs_attention to the dashboard but suppresses the webhook when notify=false', () => {
    const bus = makeBus()
    const notifier = new RealtimeSessionNotifier(bus as unknown as RealtimeBus)

    notifier.emitNeedsAttention({ userId: 'u-1', accountId: 'acc-1', reason: 'session_killed', notify: false })

    expect(bus.publishUserEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.needs_attention' }))
    expect(bus.enqueueNotification).not.toHaveBeenCalled()
  })

  it('swallows bus rejections (fire-and-forget) and logs a warning', async () => {
    const bus = {
      publishUserEvent: vi.fn().mockRejectedValue(new Error('redis down')),
      enqueueNotification: vi.fn().mockRejectedValue(new Error('redis down')),
    }
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }
    const notifier = new RealtimeSessionNotifier(bus as unknown as RealtimeBus, logger as any)

    expect(() => notifier.emitNeedsAttention({ userId: 'u-1', accountId: 'acc-1', reason: 'auth_timeout' })).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(logger.warn).toHaveBeenCalled()
  })
})
