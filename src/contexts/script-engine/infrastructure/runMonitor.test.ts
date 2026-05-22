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
})
