import { describe, it, expect, vi } from 'vitest'
import { RecordedSessionLauncher, type RecordedSessionLauncherDeps } from './RecordedSessionLauncher.js'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const runRepo = () => ({
  create: vi.fn().mockResolvedValue(undefined),
  markSuccess: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  markOrphaned: vi.fn().mockResolvedValue(0),
  pruneOlderThan: vi.fn().mockResolvedValue(0),
})

const stepRepo = () => ({
  start: vi.fn().mockResolvedValue(undefined),
  finish: vi.fn().mockResolvedValue(undefined),
  record: vi.fn().mockResolvedValue(undefined),
})

const fakeLogger = () => {
  const l: any = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => l }
  return l
}

function build(overrides: Partial<RecordedSessionLauncherDeps> = {}) {
  const runs = runRepo()
  const steps = stepRepo()
  const logger = fakeLogger()
  const launcher = new RecordedSessionLauncher({
    runRepo: runs, stepRepo: steps, logger, newRunId: () => 'run-1', ...overrides,
  })
  return { launcher, runs, steps, logger }
}

// Lets the assertions run after the `done` handlers have settled.
const flush = () => new Promise((r) => setTimeout(r, 0))

const target = { accountId: 'acc-1', scriptId: 'script-1' }

describe('RecordedSessionLauncher', () => {
  it('opens exactly one run row for the session and hands the recorder to the launch', async () => {
    const { launcher, runs } = build()
    const done = deferred<string>()
    let seenRunId: string | undefined

    await launcher.launch(target, async (recorder) => {
      seenRunId = recorder.runId
      return { done: done.promise }
    })

    expect(runs.create).toHaveBeenCalledTimes(1)
    expect(runs.create).toHaveBeenCalledWith('run-1', 'acc-1', 'script-1')
    expect(seenRunId).toBe('run-1')
  })

  it('returns the caller’s own handle, so session lifecycle metadata survives', async () => {
    // SessionManager reads userId and assistedPersistent off the handle to drive the
    // dashboard light and route an assisted login loss to needs_attention.
    const { launcher } = build()
    const stop = vi.fn()
    const handle = await launcher.launch(target, async () => ({
      done: new Promise<string>(() => {}), stop, userId: 'user-9', assistedPersistent: true,
    }))

    expect(handle.userId).toBe('user-9')
    expect(handle.assistedPersistent).toBe(true)
    handle.stop()
    expect(stop).toHaveBeenCalled()
  })

  describe('closing the row from the way the session ended', () => {
    it.each([
      ['stop_requested'],
      ['max_runtime'],
    ])('records %s as a success, so restarts and shutdowns stay out of the failure list', async (reason) => {
      const { launcher, runs } = build()
      const done = deferred<string>()
      await launcher.launch(target, async () => ({ done: done.promise }))

      done.resolve(reason)
      await flush()

      expect(runs.markSuccess).toHaveBeenCalledWith('run-1', null, reason)
      expect(runs.markFailed).not.toHaveBeenCalled()
    })

    it.each([
      ['auth_timeout'],
      ['logged_out'],
      ['watchdog_timeout'],
    ])('records the %s stop reason as a failure of the matching category', async (reason) => {
      const { launcher, runs } = build()
      const done = deferred<string>()
      await launcher.launch(target, async () => ({ done: done.promise }))

      done.resolve(reason)
      await flush()

      expect(runs.markFailed).toHaveBeenCalledWith('run-1', reason, reason, reason)
      expect(runs.markSuccess).not.toHaveBeenCalled()
    })

    it.each([
      ['browser_closed'],
      ['session_killed'],
    ])('records a rejected done carrying %s as that failure category', async (reason) => {
      // These arrive as thrown errors rather than returned stop reasons: the runner races
      // an explicit close/kill against the monitor.
      const { launcher, runs } = build()
      const done = deferred<string>()
      await launcher.launch(target, async () => ({ done: done.promise }))

      done.reject(new Error(reason))
      await flush()

      expect(runs.markFailed).toHaveBeenCalledWith('run-1', reason, reason, reason)
    })

    it('leaves an unrecognised crash to be categorised from the error, with no stop reason', async () => {
      // stop_reason stays a closed vocabulary; an arbitrary message belongs in error_message.
      const { launcher, runs } = build()
      const done = deferred<string>()
      await launcher.launch(target, async () => ({ done: done.promise }))

      done.reject(new Error('login_failed: bank rejected the credentials'))
      await flush()

      expect(runs.markFailed).toHaveBeenCalledWith(
        'run-1', 'login_failed: bank rejected the credentials', 'login_failed', undefined,
      )
    })

    it('records a stage row for the failing stage a crash names', async () => {
      const { launcher, steps } = build()
      const done = deferred<string>()
      await launcher.launch(target, async () => ({ done: done.promise }))

      done.reject(new Error('movements_fetch_failed: table never rendered'))
      await flush()

      expect(steps.record).toHaveBeenCalledWith(
        'run-1', 0, 'movements_fetch', 'failed',
        expect.objectContaining({ failureType: 'movements_fetch_failed' }),
      )
    })

    it('closes the row once, even though SessionManager also observes the same promise', async () => {
      const { launcher, runs } = build()
      const done = deferred<string>()
      const handle = await launcher.launch(target, async () => ({ done: done.promise }))
      handle.done.catch(() => {}) // stand in for SessionManager's own handlers

      done.resolve('stop_requested')
      await flush()
      await flush()

      expect(runs.markSuccess).toHaveBeenCalledTimes(1)
    })
  })

  describe('a launch that never gets a session', () => {
    it('records the harness cause when a pre-script stage failed, and rethrows', async () => {
      const { launcher, runs } = build()
      const boom = new Error('bad decryption key')

      await expect(
        launcher.launch(target, async (recorder) => {
          await recorder.stage('credentials', async () => { throw boom })
          return { done: Promise.resolve('never') }
        }),
      ).rejects.toThrow(boom)

      // Rethrown so SessionManager still marks the session stopped and the job fails.
      expect(runs.markFailed).toHaveBeenCalledWith('run-1', 'bad decryption key', 'credentials_failed', undefined)
    })

    it.each([
      ['launch', 'launch_failed'],
      ['load_script', 'script_load_failed'],
    ] as const)('records a failing %s stage as %s', async (stage, expected) => {
      const { launcher, runs } = build()

      await expect(
        launcher.launch(target, async (recorder) => {
          await recorder.stage(stage, async () => { throw new Error('chromium would not start') })
          return { done: Promise.resolve('never') }
        }),
      ).rejects.toThrow()

      expect(runs.markFailed).toHaveBeenCalledWith('run-1', 'chromium would not start', expected, undefined)
    })
  })

  describe('diagnostics never change monitoring behaviour', () => {
    it('launches the session even when the run row cannot be opened', async () => {
      const runs = runRepo()
      runs.create.mockRejectedValue(new Error('db down'))
      const { launcher, logger } = build({ runRepo: runs })

      const handle = await launcher.launch(target, async () => ({ done: new Promise<string>(() => {}) }))

      expect(handle).toBeDefined()
      expect(logger.warn).toHaveBeenCalledWith(
        'could not open a scrape run row',
        expect.objectContaining({ accountId: 'acc-1', error: 'db down' }),
      )
    })

    it('does not leave an unhandled rejection when closing the row fails', async () => {
      const runs = runRepo()
      runs.markSuccess.mockRejectedValue(new Error('db down'))
      const { launcher, logger } = build({ runRepo: runs })
      const done = deferred<string>()
      await launcher.launch(target, async () => ({ done: done.promise }))

      done.resolve('stop_requested')
      await flush()

      // Swallowed by the recorder's own best-effort write, so it is logged there.
      expect(logger.warn).toHaveBeenCalled()
    })
  })
})
