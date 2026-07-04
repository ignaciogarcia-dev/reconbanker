import { describe, it, expect, vi } from 'vitest'
import { RealtimeScrapeFailureNotifier } from './RealtimeScrapeFailureNotifier.js'
import type { RealtimeBus } from '../../../shared/infrastructure/realtime/RealtimeBus.js'
import type { FailureGroup, IScrapeFailureAlertStore } from '../domain/ports/IScrapeFailureAlertStore.js'

function makeBus() {
  return {
    publishUserEvent: vi.fn().mockResolvedValue(undefined),
    enqueueNotification: vi.fn().mockResolvedValue(undefined),
  }
}

// In-memory store mirroring the SQL repo: independent streaks per (account, group).
function makeStore(): IScrapeFailureAlertStore {
  const rows = new Map<string, { streak: number; alerted: boolean }>()
  const key = (a: string, g: FailureGroup) => `${a}:${g}`
  return {
    async recordFailure(accountId, group) {
      const r = rows.get(key(accountId, group)) ?? { streak: 0, alerted: false }
      r.streak += 1
      rows.set(key(accountId, group), r)
      return { streak: r.streak, alerted: r.alerted }
    },
    async markAlerted(accountId, group) {
      const r = rows.get(key(accountId, group))
      if (r) r.alerted = true
    },
    async clear(accountId, group) {
      const r = rows.get(key(accountId, group))
      const wasAlerted = r?.alerted === true
      rows.set(key(accountId, group), { streak: 0, alerted: false })
      return { wasAlerted }
    },
  }
}

describe('RealtimeScrapeFailureNotifier', () => {
  it('publishes to the dashboard on every failure but only alerts at the threshold', async () => {
    const bus = makeBus()
    const notifier = new RealtimeScrapeFailureNotifier(bus as unknown as RealtimeBus, makeStore(), 3)

    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'movements_fetch_failed' })
    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'movements_fetch_failed' })
    // First two failures: dashboard only, no external alert.
    expect(bus.publishUserEvent).toHaveBeenCalledTimes(2)
    expect(bus.enqueueNotification).not.toHaveBeenCalled()

    // Third consecutive failure crosses the threshold → exactly one external alert.
    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'movements_fetch_failed' })
    expect(bus.enqueueNotification).toHaveBeenCalledTimes(1)
    expect(bus.enqueueNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'scrape.failed', accountId: 'acc-1', data: { category: 'movements_fetch_failed' },
    }))

    // Fourth failure stays silent (already alerted).
    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'movements_fetch_failed' })
    expect(bus.enqueueNotification).toHaveBeenCalledTimes(1)
  })

  it('keeps connection and scrape streaks independent', async () => {
    const bus = makeBus()
    const notifier = new RealtimeScrapeFailureNotifier(bus as unknown as RealtimeBus, makeStore(), 3)

    // Interleave two connection failures and two scrape failures — neither group reaches 3.
    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'login_failed' })
    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'movements_fetch_failed' })
    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'login_failed' })
    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'movements_fetch_failed' })
    expect(bus.enqueueNotification).not.toHaveBeenCalled()

    // Third connection failure alerts connection only.
    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'navigation_failed' })
    expect(bus.enqueueNotification).toHaveBeenCalledTimes(1)
    expect(bus.enqueueNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'connection.failed' }))
  })

  it('emits a recovery only for a group that had alerted', async () => {
    const bus = makeBus()
    const store = makeStore()
    const notifier = new RealtimeScrapeFailureNotifier(bus as unknown as RealtimeBus, store, 3)

    // Drive the scrape group over the threshold.
    for (let i = 0; i < 3; i++) {
      await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'timeout' })
    }
    bus.enqueueNotification.mockClear()
    bus.publishUserEvent.mockClear()

    await notifier.recordSuccess({ userId: 'u-1', accountId: 'acc-1' })

    // Only scrape recovered (connection never alerted).
    expect(bus.enqueueNotification).toHaveBeenCalledTimes(1)
    expect(bus.enqueueNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'scrape.recovered', accountId: 'acc-1' }))
  })

  it('does not emit a recovery when no alert was sent', async () => {
    const bus = makeBus()
    const notifier = new RealtimeScrapeFailureNotifier(bus as unknown as RealtimeBus, makeStore(), 3)

    await notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'timeout' }) // streak 1, no alert
    bus.enqueueNotification.mockClear()

    await notifier.recordSuccess({ userId: 'u-1', accountId: 'acc-1' })
    expect(bus.enqueueNotification).not.toHaveBeenCalled()
  })

  it('swallows store/bus errors without throwing (fire-and-forget)', async () => {
    const bus = makeBus()
    const store: IScrapeFailureAlertStore = {
      recordFailure: vi.fn().mockRejectedValue(new Error('db down')),
      markAlerted: vi.fn(),
      clear: vi.fn().mockRejectedValue(new Error('db down')),
    }
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }
    const notifier = new RealtimeScrapeFailureNotifier(bus as unknown as RealtimeBus, store, 3, logger as any)

    await expect(notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'timeout' })).resolves.toBeUndefined()
    await expect(notifier.recordSuccess({ userId: 'u-1', accountId: 'acc-1' })).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('swallows a failing bus on both publish and enqueue (fire-and-forget)', async () => {
    // The store succeeds and reaches the threshold (so enqueue runs), but the bus itself rejects on
    // both publish and enqueue — exercising the .catch() handlers around the dashboard fan-out.
    const bus = {
      publishUserEvent: vi.fn().mockRejectedValue(new Error('bus down')),
      enqueueNotification: vi.fn().mockRejectedValue(new Error('bus down')),
    }
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }
    const notifier = new RealtimeScrapeFailureNotifier(bus as unknown as RealtimeBus, makeStore(), 3, logger as any)

    for (let i = 0; i < 3; i++) {
      await expect(notifier.recordFailure({ userId: 'u-1', accountId: 'acc-1', category: 'timeout' })).resolves.toBeUndefined()
    }
    // Threshold crossed → enqueue attempted; both bus calls rejected but were swallowed and logged.
    expect(bus.enqueueNotification).toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith('publish failed', expect.objectContaining({ error: expect.stringContaining('bus down') }))
    expect(logger.warn).toHaveBeenCalledWith('notify enqueue failed', expect.objectContaining({ error: expect.stringContaining('bus down') }))
  })
})
