import { describe, it, expect, vi } from 'vitest'
import { runMonitor, type MonitorTransaction, type ScriptHooks } from './runMonitor.js'

const tx = (externalId: string): MonitorTransaction => ({
  externalId, referenceHash: `h-${externalId}`, amount: 10, currency: 'USD', receivedAt: new Date(), raw: {},
})

const baseContext = { accountId: 'a1', username: 'u', password: 'p', lastExternalId: null }
const noSleep = async () => {}

function hooks(partial: Partial<ScriptHooks>): ScriptHooks {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    isAuthenticated: vi.fn().mockResolvedValue(true),
    poll: vi.fn().mockResolvedValue([]),
    ...partial,
  }
}

describe('runMonitor', () => {
  it('logs in, waits for auth, emits only new transactions, dedups across polls', async () => {
    let poll = 0
    const emitted: string[][] = []
    const h = hooks({
      poll: vi.fn().mockImplementation(async () => {
        poll += 1
        if (poll === 1) return [tx('b'), tx('a')]      // a, b are new
        return [tx('c'), tx('b'), tx('a')]              // only c is new
      }),
    })
    let calls = 0
    const reason = await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep,
      onTransactions: async (batch) => { emitted.push(batch.map(t => t.externalId)) },
      shouldStop: () => { calls += 1; return calls > 2 }, // allow 2 poll cycles
    })

    expect(h.login).toHaveBeenCalledTimes(1)
    expect(reason).toBe('stop_requested')
    expect(emitted[0].sort()).toEqual(['a', 'b'])
    expect(emitted[1]).toEqual(['c'])
  })

  it('seeds the dedup set from lastExternalId so it is never re-emitted', async () => {
    const emitted: string[][] = []
    const h = hooks({ poll: vi.fn().mockResolvedValue([tx('new'), tx('seen')]) })
    let calls = 0
    await runMonitor({
      hooks: h, page: {}, context: { ...baseContext, lastExternalId: 'seen' }, sleep: noSleep,
      onTransactions: async (batch) => { emitted.push(batch.map(t => t.externalId)) },
      shouldStop: () => { calls += 1; return calls > 1 },
    })
    expect(emitted[0]).toEqual(['new'])
  })

  it('stops with logged_out when isAuthenticated turns false during the loop', async () => {
    let auth = 0
    const h = hooks({
      isAuthenticated: vi.fn().mockImplementation(async () => { auth += 1; return auth <= 1 }), // true once (initial), then false
      poll: vi.fn().mockResolvedValue([]),
    })
    const reason = await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep,
      onTransactions: async () => {},
    })
    expect(reason).toBe('logged_out')
  })

  it('returns auth_timeout if isAuthenticated never becomes true', async () => {
    const h = hooks({ isAuthenticated: vi.fn().mockResolvedValue(false) })
    const reason = await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep, authTimeoutMs: 5,
      onTransactions: async () => {},
    })
    expect(reason).toBe('auth_timeout')
  })

  it('calls keepAlive when a poll yields no new transactions', async () => {
    const keepAlive = vi.fn().mockResolvedValue(undefined)
    const h = hooks({ poll: vi.fn().mockResolvedValue([]), keepAlive })
    let calls = 0
    await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep,
      onTransactions: async () => {},
      shouldStop: () => { calls += 1; return calls > 1 },
    })
    expect(keepAlive).toHaveBeenCalled()
  })

  it('stops with max_runtime once the deadline elapses', async () => {
    const h = hooks({ poll: vi.fn().mockResolvedValue([]) })
    const reason = await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep,
      onTransactions: async () => {},
      maxRuntimeMs: 1,
      shouldStop: () => false,
    })
    expect(reason).toBe('max_runtime')
  })

  it('clears the dedup set when getBankDay returns a new value', async () => {
    const days = ['day1', 'day1', 'day2', 'day2']
    let dayIdx = 0
    let pollCount = 0
    const emitted: string[][] = []
    const h = hooks({
      poll: vi.fn().mockImplementation(async () => {
        pollCount += 1
        return [tx('a')]
      }),
    })
    let calls = 0
    await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep,
      getBankDay: () => days[Math.min(dayIdx++, days.length - 1)],
      onTransactions: async (batch) => { emitted.push(batch.map((t) => t.externalId)) },
      shouldStop: () => { calls += 1; return calls > 2 },
    })
    // Initial getBankDay sets currentDay=day1; first poll emits 'a'. Next iteration
    // getBankDay returns 'day2', clearing the dedup set, so 'a' is emitted again.
    expect(emitted).toEqual([['a'], ['a']])
    expect(pollCount).toBeGreaterThanOrEqual(2)
  })

  it('recovers from a poll error by calling keepAlive and continuing', async () => {
    let pollCount = 0
    const keepAlive = vi.fn().mockResolvedValue(undefined)
    const debugLog = vi.fn()
    const h = hooks({
      poll: vi.fn().mockImplementation(async () => {
        pollCount += 1
        if (pollCount === 1) throw new Error('selector not found')
        return [tx('x')]
      }),
      keepAlive,
    })
    const emitted: string[][] = []
    let calls = 0
    await runMonitor({
      hooks: h, page: {}, context: { ...baseContext, debugLog }, sleep: noSleep,
      onTransactions: async (batch) => { emitted.push(batch.map((t) => t.externalId)) },
      shouldStop: () => { calls += 1; return calls > 2 },
    })
    expect(keepAlive).toHaveBeenCalled()
    expect(emitted).toEqual([['x']])
    expect(debugLog).toHaveBeenCalled()
  })

  it('swallows keepAlive errors during poll failure recovery', async () => {
    let pollCount = 0
    const keepAlive = vi.fn().mockRejectedValue(new Error('keepalive boom'))
    const h = hooks({
      poll: vi.fn().mockImplementation(async () => {
        pollCount += 1
        if (pollCount === 1) throw new Error('poll boom')
        return []
      }),
      keepAlive,
    })
    let calls = 0
    const reason = await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep,
      onTransactions: async () => {},
      shouldStop: () => { calls += 1; return calls > 2 },
    })
    expect(reason).toBe('stop_requested')
    expect(keepAlive).toHaveBeenCalled()
  })

  it('handles poll failure when keepAlive is not provided', async () => {
    let pollCount = 0
    const h = hooks({
      poll: vi.fn().mockImplementation(async () => {
        pollCount += 1
        if (pollCount === 1) throw new Error('poll boom')
        return []
      }),
    })
    let calls = 0
    const reason = await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep,
      onTransactions: async () => {},
      shouldStop: () => { calls += 1; return calls > 2 },
    })
    expect(reason).toBe('stop_requested')
  })

  it('uses the default sleep when none is provided', async () => {
    const h = hooks({ isAuthenticated: vi.fn().mockResolvedValue(false) })
    const reason = await runMonitor({
      hooks: h, page: {}, context: baseContext,
      onTransactions: async () => {},
      authTimeoutMs: 1,
    })
    expect(reason).toBe('auth_timeout')
  })

  describe('debugLog payloads', () => {
    // Collects the structured events runMonitor emits via context.debugLog.
    function recorder() {
      const events: Array<Record<string, unknown>> = []
      const debugLog = vi.fn((line: string) => { events.push(JSON.parse(line)) })
      return { debugLog, events, names: () => events.map((e) => e.event) }
    }

    it('forwards the poll error message on poll_failed', async () => {
      const { debugLog, events } = recorder()
      let pollCount = 0
      const h = hooks({
        poll: vi.fn().mockImplementation(async () => {
          pollCount += 1
          if (pollCount === 1) throw new Error('selector not found')
          return []
        }),
        keepAlive: vi.fn().mockResolvedValue(undefined),
      })
      let calls = 0
      await runMonitor({
        hooks: h, page: {}, context: { ...baseContext, debugLog }, sleep: noSleep,
        onTransactions: async () => {},
        shouldStop: () => { calls += 1; return calls > 2 },
      })
      const failed = events.find((e) => e.event === 'poll_failed')
      expect(failed).toMatchObject({ event: 'poll_failed', error: 'selector not found' })
      expect(failed?.at).toEqual(expect.any(String))
    })

    it('stringifies a non-Error poll rejection', async () => {
      const { debugLog, events } = recorder()
      let pollCount = 0
      const h = hooks({
        poll: vi.fn().mockImplementation(async () => {
          pollCount += 1
          if (pollCount === 1) throw 'net down' // eslint-disable-line no-throw-literal
          return []
        }),
      })
      let calls = 0
      await runMonitor({
        hooks: h, page: {}, context: { ...baseContext, debugLog }, sleep: noSleep,
        onTransactions: async () => {},
        shouldStop: () => { calls += 1; return calls > 2 },
      })
      expect(events.find((e) => e.event === 'poll_failed')).toMatchObject({ error: 'net down' })
    })

    it('emits authenticated then stop_requested on a clean run', async () => {
      const { debugLog, names } = recorder()
      const h = hooks({ poll: vi.fn().mockResolvedValue([]) })
      let calls = 0
      await runMonitor({
        hooks: h, page: {}, context: { ...baseContext, debugLog }, sleep: noSleep,
        onTransactions: async () => {},
        shouldStop: () => { calls += 1; return calls > 0 },
      })
      expect(names()).toContain('authenticated')
      expect(names()).toContain('stop_requested')
    })

    it('emits auth_timeout when auth never succeeds', async () => {
      const { debugLog, names } = recorder()
      const h = hooks({ isAuthenticated: vi.fn().mockResolvedValue(false) })
      await runMonitor({
        hooks: h, page: {}, context: { ...baseContext, debugLog }, sleep: noSleep, authTimeoutMs: 5,
        onTransactions: async () => {},
      })
      expect(names()).toEqual(['auth_timeout'])
    })

    it('emits logged_out when the session is lost mid-loop', async () => {
      const { debugLog, names } = recorder()
      let auth = 0
      const h = hooks({
        isAuthenticated: vi.fn().mockImplementation(async () => { auth += 1; return auth <= 1 }),
      })
      await runMonitor({
        hooks: h, page: {}, context: { ...baseContext, debugLog }, sleep: noSleep,
        onTransactions: async () => {},
      })
      expect(names()).toContain('logged_out')
    })

    it('emits max_runtime when the deadline elapses', async () => {
      const { debugLog, names } = recorder()
      const h = hooks({ poll: vi.fn().mockResolvedValue([]) })
      await runMonitor({
        hooks: h, page: {}, context: { ...baseContext, debugLog }, sleep: noSleep,
        onTransactions: async () => {}, maxRuntimeMs: 1, shouldStop: () => false,
      })
      expect(names()).toContain('max_runtime')
    })
  })

  it('supports an async shouldStop predicate', async () => {
    const h = hooks({ poll: vi.fn().mockResolvedValue([]) })
    let calls = 0
    const reason = await runMonitor({
      hooks: h, page: {}, context: baseContext, sleep: noSleep,
      onTransactions: async () => {},
      shouldStop: async () => { calls += 1; return calls > 1 },
    })
    expect(reason).toBe('stop_requested')
    expect(calls).toBeGreaterThan(1)
  })

  it('loops without keepAlive when a poll yields only duplicates', async () => {
    // lastExternalId seeds the dedup set, so the returned tx is never fresh and,
    // with no keepAlive hook, the loop just sleeps and continues until stop.
    const h = hooks({ poll: vi.fn().mockResolvedValue([tx('dup')]) })
    const onTransactions = vi.fn().mockResolvedValue(undefined)
    let calls = 0
    const reason = await runMonitor({
      hooks: h, page: {}, context: { ...baseContext, lastExternalId: 'dup' }, sleep: noSleep,
      onTransactions,
      shouldStop: () => { calls += 1; return calls > 1 },
    })
    expect(reason).toBe('stop_requested')
    expect(onTransactions).not.toHaveBeenCalled()
  })
})
