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
  const handlers: Record<string, Array<() => void>> = {}
  const on = vi.fn((evt: string, cb: () => void) => { (handlers[evt] ||= []).push(cb) })
  const browserOn = vi.fn()
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
    on,
    browser: () => ({ on: browserOn }),
  }
  launchPersistentContextMock.mockResolvedValue(browserContext)
  return { browserContext, page, close, newPage, emit: (evt: string) => (handlers[evt] || []).forEach((f) => f()) }
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
      expect.objectContaining({ headless: true }),
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

  it('closes the context when the script body throws before the monitor starts', async () => {
    const { close } = buildContext()
    const runner = new PersistentPlaywrightRunner()

    await expect(
      runner.start({ ...baseInput(), scriptCode: 'throw new Error("script boom")' }),
    ).rejects.toThrow('script boom')
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

  it('forwards context.debugLog through to runMonitor unchanged', async () => {
    buildContext()
    runMonitorMock.mockResolvedValue('stop_requested')
    const runner = new PersistentPlaywrightRunner()
    const debugLog = vi.fn()
    const input = baseInput()

    await (await runner.start({ ...input, context: { ...input.context, debugLog } })).done
    expect(runMonitorMock).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ debugLog }) }),
    )
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

  it('resolves authenticated=true once runMonitor reports authentication', async () => {
    buildContext()
    // runMonitor signals auth by invoking the injected onAuthenticated hook (wired to markAuthed(true)).
    runMonitorMock.mockImplementation((opts: any) => { opts.onAuthenticated?.(); return Promise.resolve('stop_requested') })
    const runner = new PersistentPlaywrightRunner()

    const handle = await runner.start(baseInput())
    await expect(handle.authenticated).resolves.toBe(true)
    await handle.done
  })

  it('resolves authenticated=false when the session ends before authenticating', async () => {
    buildContext()
    runMonitorMock.mockResolvedValue('auth_timeout') // onAuthenticated never invoked
    const runner = new PersistentPlaywrightRunner()

    const handle = await runner.start(baseInput())
    await handle.done
    await expect(handle.authenticated).resolves.toBe(false)
  })

  it('keeps authenticated non-rejecting (resolves false) when the monitor rejects before auth', async () => {
    buildContext()
    runMonitorMock.mockRejectedValue(new Error('monitor blew up'))
    const runner = new PersistentPlaywrightRunner()

    const handle = await runner.start(baseInput())
    await expect(handle.done).rejects.toThrow('monitor blew up')
    await expect(handle.authenticated).resolves.toBe(false)
  })

  it('kill() rejects done with session_killed and closes the context', async () => {
    const { close } = buildContext()
    runMonitorMock.mockReturnValue(new Promise(() => {})) // hung monitor that never settles
    const runner = new PersistentPlaywrightRunner()

    const handle = await runner.start(baseInput())
    handle.kill()

    await expect(handle.done).rejects.toThrow('session_killed')
    expect(close).toHaveBeenCalled()
  })

  it('an external browser close rejects done with browser_closed (not session_killed)', async () => {
    const { emit } = buildContext()
    runMonitorMock.mockReturnValue(new Promise(() => {}))
    const runner = new PersistentPlaywrightRunner()

    const handle = await runner.start(baseInput())
    emit('close')

    await expect(handle.done).rejects.toThrow('browser_closed')
  })

  describe('harness stage recording', () => {
    // Records which stages the runner reports, so a failure before the script body ever
    // runs is attributable rather than landing as "unknown".
    function fakeRecorder() {
      const stages: string[] = []
      const failed: string[] = []
      return {
        stages,
        failed,
        recorder: {
          stage: async <T,>(step: string, fn: () => Promise<T>) => {
            stages.push(step)
            try {
              return await fn()
            } catch (err) {
              failed.push(step)
              throw err
            }
          },
          beginStage: () => ({ finish: async () => {} }),
          note: async () => {},
          observeUrl: vi.fn(),
          event: vi.fn(),
        },
      }
    }

    it('reports the browser launch and the script load, and forwards the recorder to the monitor', async () => {
      buildContext()
      runMonitorMock.mockResolvedValue('stop_requested')
      const { recorder, stages } = fakeRecorder()

      await (await new PersistentPlaywrightRunner().start({ ...baseInput(), recorder: recorder as any })).done

      expect(stages).toEqual(['launch', 'load_script'])
      expect(runMonitorMock).toHaveBeenCalledWith(expect.objectContaining({ recorder }))
    })

    it('attributes a browser that will not start to the launch stage', async () => {
      launchPersistentContextMock.mockRejectedValue(new Error('chromium refused to start'))
      const { recorder, failed } = fakeRecorder()

      await expect(
        new PersistentPlaywrightRunner().start({ ...baseInput(), recorder: recorder as any }),
      ).rejects.toThrow('chromium refused to start')
      expect(failed).toEqual(['launch'])
    })

    it('attributes a script body that throws to the script-load stage, and still closes the context', async () => {
      const { close } = buildContext()
      const { recorder, failed } = fakeRecorder()

      await expect(
        new PersistentPlaywrightRunner().start({
          ...baseInput(), scriptCode: 'throw new Error("script boom")', recorder: recorder as any,
        }),
      ).rejects.toThrow('script boom')
      expect(failed).toEqual(['load_script'])
      expect(close).toHaveBeenCalled()
    })

    it('attributes a script returning the wrong shape to the script-load stage', async () => {
      buildContext()
      const { recorder, failed } = fakeRecorder()

      await expect(
        new PersistentPlaywrightRunner().start({
          ...baseInput(), scriptCode: 'return null', recorder: recorder as any,
        }),
      ).rejects.toThrow(/hooks object/i)
      expect(failed).toEqual(['load_script'])
    })

    it('closes the browser context when page setup fails inside the launch stage', async () => {
      // The outer cleanup does not cover this scope, so the launch stage owns it.
      const close = vi.fn().mockResolvedValue(undefined)
      const page = { addInitScript: vi.fn().mockRejectedValue(new Error('page setup failed')) }
      launchPersistentContextMock.mockResolvedValue({
        pages: () => [page], newPage: vi.fn(), close, on: vi.fn(), browser: () => ({ on: vi.fn() }),
      })
      const { recorder, failed } = fakeRecorder()

      await expect(
        new PersistentPlaywrightRunner().start({ ...baseInput(), recorder: recorder as any }),
      ).rejects.toThrow('page setup failed')
      expect(failed).toEqual(['launch'])
      expect(close).toHaveBeenCalled()
    })
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
