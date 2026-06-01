import { describe, it, expect, vi, beforeEach } from 'vitest'

const launchMock = vi.fn()
const dbQueryMock = vi.fn()

vi.mock('playwright', () => ({
  chromium: {
    launch: (...args: unknown[]) => launchMock(...args),
  },
}))

vi.mock('../../../shared/infrastructure/db/client.js', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}))

import { PlaywrightRunner } from './PlaywrightRunner.js'

type Page = Record<string, ReturnType<typeof vi.fn>>

function buildBrowserChain(executeBody: string) {
  const close = vi.fn().mockResolvedValue(undefined)
  const page: Page = {
    addInitScript: vi.fn().mockResolvedValue(undefined),
  }
  const ctx = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  }
  const browser = {
    newContext: vi.fn().mockResolvedValue(ctx),
    close,
  }
  launchMock.mockResolvedValue(browser)
  return { browser, ctx, page, close, executeBody }
}

describe('PlaywrightRunner', () => {
  beforeEach(() => {
    launchMock.mockReset()
    dbQueryMock.mockReset()
  })

  it('throws when the script has no codeSnapshot', async () => {
    const runner = new PlaywrightRunner()
    await expect(
      runner.execute({ id: 's1', codeSnapshot: undefined } as any, { accountId: 'a1', lastExternalId: null }),
    ).rejects.toThrow(/no code snapshot/i)
  })

  it('throws when no valid credentials exist for the account', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [] })
    const runner = new PlaywrightRunner()
    await expect(
      runner.execute({ id: 's1', codeSnapshot: 'return []' } as any, { accountId: 'a1', lastExternalId: null }),
    ).rejects.toThrow(/no valid credentials/i)
  })

  it('launches a browser, runs the script body, returns its transactions, and closes the browser', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ username: 'user1', encrypted_password: 'pw1' }] })
    const { browser, close } = buildBrowserChain('return []')

    const codeSnapshot = `
      return [{
        externalId: 'tx-1',
        referenceHash: 'h1',
        amount: 100,
        currency: 'USD',
        receivedAt: new Date(0),
        raw: { ctx: context, hasPage: !!page },
      }]
    `

    const runner = new PlaywrightRunner()
    const txs = await runner.execute(
      { id: 's1', codeSnapshot } as any,
      { accountId: 'acc-42', lastExternalId: 'last-x' },
    )

    expect(txs).toHaveLength(1)
    expect(txs[0].externalId).toBe('tx-1')
    expect(txs[0].raw).toMatchObject({ hasPage: true })
    expect(txs[0].raw.ctx).toMatchObject({
      accountId: 'acc-42',
      username: 'user1',
      password: 'pw1',
      lastExternalId: 'last-x',
    })
    expect(launchMock).toHaveBeenCalledWith(expect.objectContaining({ headless: true }))
    expect(browser.newContext).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('returns [] when the script returns null/undefined', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ username: 'u', encrypted_password: 'p' }] })
    const { close } = buildBrowserChain('')
    const runner = new PlaywrightRunner()
    const txs = await runner.execute(
      { id: 's2', codeSnapshot: 'return undefined' } as any,
      { accountId: 'acc-1', lastExternalId: null },
    )
    expect(txs).toEqual([])
    expect(close).toHaveBeenCalled()
  })

  it('still closes the browser when the script throws', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ username: 'u', encrypted_password: 'p' }] })
    const { close } = buildBrowserChain('')
    const runner = new PlaywrightRunner()
    await expect(
      runner.execute(
        { id: 's3', codeSnapshot: 'throw new Error("script blew up")' } as any,
        { accountId: 'acc-1', lastExternalId: null },
      ),
    ).rejects.toThrow('script blew up')
    expect(close).toHaveBeenCalled()
  })

  it('exercises the addInitScript navigator.webdriver guard', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ username: 'u', encrypted_password: 'p' }] })
    const { page } = buildBrowserChain('')
    const runner = new PlaywrightRunner()
    await runner.execute({ id: 's4', codeSnapshot: 'return []' } as any, { accountId: 'a', lastExternalId: null })

    expect(page.addInitScript).toHaveBeenCalled()
    const initFn = page.addInitScript.mock.calls[0][0] as () => void
    // Invoke the captured arrow directly inside a fake-navigator scope so the
    // Object.defineProperty body actually runs against a writable target.
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: { webdriver: true }, configurable: true, writable: true })
    try {
      initFn()
      expect((globalThis as any).navigator.webdriver).toBeUndefined()
    } finally {
      if (originalDescriptor) Object.defineProperty(globalThis, 'navigator', originalDescriptor)
      else delete (globalThis as any).navigator
    }
  })

  it('rejects when the script takes longer than the configured timeout', async () => {
    vi.useFakeTimers()
    dbQueryMock.mockResolvedValueOnce({ rows: [{ username: 'u', encrypted_password: 'p' }] })
    buildBrowserChain('')
    const runner = new PlaywrightRunner()

    const promise = runner.execute(
      {
        id: 's5',
        codeSnapshot: 'await new Promise((r) => setTimeout(r, 20*60*1000)); return []',
      } as any,
      { accountId: 'a', lastExternalId: null },
    )
    // Attach a catch immediately to mark the rejection as handled.
    const caught = promise.catch((e) => e)
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000)
    const err = await caught
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/timed out/i)
    vi.useRealTimers()
  })
})
