import { describe, it, expect, vi, beforeEach } from 'vitest'

const launchPersistentContextMock = vi.fn()
const runMonitorMock = vi.fn()

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: (...args: unknown[]) => launchPersistentContextMock(...args),
  },
}))

vi.mock('./runMonitor.js', async () => {
  const actual = await vi.importActual<typeof import('./runMonitor.js')>('./runMonitor.js')
  return {
    ...actual,
    runMonitor: (...args: unknown[]) => runMonitorMock(...args),
  }
})

import { PersistentPlaywrightRunner } from './PersistentPlaywrightRunner.js'

function buildContext(pages: any[] = []) {
  const newPage = vi.fn()
  const close = vi.fn().mockResolvedValue(undefined)
  const page = pages[0] ?? {
    addInitScript: vi.fn().mockResolvedValue(undefined),
  }
  if (!pages.length) newPage.mockResolvedValue(page)
  const browserContext = {
    pages: () => pages,
    newPage,
    close,
  }
  launchPersistentContextMock.mockResolvedValue(browserContext)
  return { browserContext, page, close, newPage }
}

const baseInput = () => ({
  scriptCode: 'return { login: async()=>{}, isAuthenticated: async()=>true, poll: async()=>[] }',
  context: { accountId: 'acc-1', username: 'u', password: 'p', lastExternalId: null as string | null },
  loginMode: 'simple' as const,
  pollIntervalMs: 1000,
  onTransactions: vi.fn().mockResolvedValue(undefined),
  shouldStop: () => false,
})

describe('PersistentPlaywrightRunner', () => {
  beforeEach(() => {
    launchPersistentContextMock.mockReset()
    runMonitorMock.mockReset()
  })

  it('launches a persistent context, runs the script body, and forwards a handle whose done resolves with the monitor reason', async () => {
    const { close, page } = buildContext()
    runMonitorMock.mockResolvedValue('stop_requested')
    const runner = new PersistentPlaywrightRunner()

    const handle = await runner.start(baseInput())
    expect(launchPersistentContextMock).toHaveBeenCalledWith(
      expect.stringContaining('acc-1'),
      expect.objectContaining({ headless: false }),
    )
    expect(page.addInitScript).toHaveBeenCalled()

    const reason = await handle.done
    expect(reason).toBe('stop_requested')
    expect(close).toHaveBeenCalled()
  })

  it('reuses the existing browserContext page when one is already open', async () => {
    const existingPage = { addInitScript: vi.fn().mockResolvedValue(undefined) }
    const { newPage } = buildContext([existingPage])
    runMonitorMock.mockResolvedValue('stop_requested')
    const runner = new PersistentPlaywrightRunner()

    await (await runner.start(baseInput())).done
    expect(newPage).not.toHaveBeenCalled()
    expect(existingPage.addInitScript).toHaveBeenCalled()
  })

  it('uses a longer auth timeout in assisted login mode', async () => {
    buildContext()
    runMonitorMock.mockResolvedValue('stop_requested')
    const runner = new PersistentPlaywrightRunner()

    await (await runner.start({ ...baseInput(), loginMode: 'assisted' })).done
    expect(runMonitorMock).toHaveBeenCalledWith(expect.objectContaining({ authTimeoutMs: 300_000 }))
  })

  it('uses a short auth timeout in simple login mode', async () => {
    buildContext()
    runMonitorMock.mockResolvedValue('stop_requested')
    const runner = new PersistentPlaywrightRunner()

    await (await runner.start({ ...baseInput(), loginMode: 'simple' })).done
    expect(runMonitorMock).toHaveBeenCalledWith(expect.objectContaining({ authTimeoutMs: 30_000 }))
  })

  it('throws and closes the context when the script does not return a hooks object', async () => {
    const { close } = buildContext()
    const runner = new PersistentPlaywrightRunner()

    await expect(
      runner.start({ ...baseInput(), scriptCode: 'return null' }),
    ).rejects.toThrow(/hooks object/i)
    expect(close).toHaveBeenCalled()
  })

  it('throws and closes the context when the returned hooks object has no poll', async () => {
    const { close } = buildContext()
    const runner = new PersistentPlaywrightRunner()

    await expect(
      runner.start({ ...baseInput(), scriptCode: 'return { login: async()=>{} }' }),
    ).rejects.toThrow(/hooks object/i)
    expect(close).toHaveBeenCalled()
  })

  it('stop() flips the shouldStop predicate forwarded to runMonitor', async () => {
    buildContext()
    let captured: any
    runMonitorMock.mockImplementation((opts) => { captured = opts; return Promise.resolve('stop_requested') })
    const runner = new PersistentPlaywrightRunner()

    const userShouldStop = vi.fn(() => false)
    const handle = await runner.start({ ...baseInput(), shouldStop: userShouldStop })
    expect(captured.shouldStop()).toBe(false)
    expect(userShouldStop).toHaveBeenCalled()

    handle.stop()
    expect(captured.shouldStop()).toBe(true)
    await handle.done
  })

  it('forwards getBankDay through to runMonitor', async () => {
    buildContext()
    runMonitorMock.mockResolvedValue('stop_requested')
    const runner = new PersistentPlaywrightRunner()
    const getBankDay = () => '01012026'

    await (await runner.start({ ...baseInput(), getBankDay })).done
    expect(runMonitorMock).toHaveBeenCalledWith(expect.objectContaining({ getBankDay }))
  })

  it('still closes the context when the monitor rejects', async () => {
    const { close } = buildContext()
    runMonitorMock.mockRejectedValue(new Error('monitor blew up'))
    const runner = new PersistentPlaywrightRunner()

    const handle = await runner.start(baseInput())
    await expect(handle.done).rejects.toThrow('monitor blew up')
    expect(close).toHaveBeenCalled()
  })

  it('does not throw if context.close itself rejects during monitor cleanup', async () => {
    const close = vi.fn().mockRejectedValue(new Error('close failed'))
    const page = { addInitScript: vi.fn().mockResolvedValue(undefined) }
    launchPersistentContextMock.mockResolvedValue({
      pages: () => [page], newPage: vi.fn(), close,
    })
    runMonitorMock.mockResolvedValue('stop_requested')
    const runner = new PersistentPlaywrightRunner()

    const handle = await runner.start(baseInput())
    await expect(handle.done).resolves.toBe('stop_requested')
    expect(close).toHaveBeenCalled()
  })

  it('exercises the addInitScript navigator.webdriver guard', async () => {
    const { page } = buildContext()
    runMonitorMock.mockResolvedValue('stop_requested')
    const runner = new PersistentPlaywrightRunner()
    await (await runner.start(baseInput())).done

    const initFn = (page as any).addInitScript.mock.calls[0][0] as () => void
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
})
