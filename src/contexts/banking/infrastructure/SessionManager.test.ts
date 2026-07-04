import { describe, it, expect, vi } from 'vitest'
import { SessionManager, type SessionHandle } from './SessionManager.js'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const sessionRepo = () => ({
  markRunning: vi.fn().mockResolvedValue(undefined),
  markStopped: vi.fn().mockResolvedValue(undefined),
  markNeedsAttention: vi.fn().mockResolvedValue(undefined),
  markAllRunningStopped: vi.fn().mockResolvedValue(0),
})
const fakeLogger = () => { const l: any = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => l }; return l }
const fakeNotifier = () => ({ emitStarted: vi.fn(), emitStopped: vi.fn(), emitNeedsAttention: vi.fn(), emitRecovered: vi.fn() })

describe('SessionManager', () => {
  it('starts a session, marks it running, and is idempotent while alive', async () => {
    const repo = sessionRepo()
    const d = deferred<string>()
    const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), done: d.promise } as SessionHandle)
    const mgr = new SessionManager(startFn, repo)

    await mgr.ensureRunning('acc-1')
    await mgr.ensureRunning('acc-1') // second call is a no-op

    expect(startFn).toHaveBeenCalledTimes(1)
    expect(repo.markRunning).toHaveBeenCalledWith('acc-1')
    expect(mgr.isRunning('acc-1')).toBe(true)
  })

  it('marks stopped and frees the slot when the session ends', async () => {
    const repo = sessionRepo()
    const d = deferred<string>()
    const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), done: d.promise } as SessionHandle)
    const mgr = new SessionManager(startFn, repo)

    await mgr.ensureRunning('acc-1')
    d.resolve('logged_out')
    await new Promise((r) => setTimeout(r, 0)) // let the .finally settle

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'logged_out')
    expect(mgr.isRunning('acc-1')).toBe(false)
  })

  it('marks stopped with the error message when the session rejects', async () => {
    const repo = sessionRepo()
    const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), done: Promise.reject(new Error('boom')) } as SessionHandle)
    const mgr = new SessionManager(startFn, repo)

    await mgr.ensureRunning('acc-1')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'boom')
    expect(mgr.isRunning('acc-1')).toBe(false)
  })

  it('marks stopped with the resolved stop reason', async () => {
    const repo = sessionRepo()
    const d = deferred<string>()
    const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), done: d.promise } as SessionHandle)
    const mgr = new SessionManager(startFn, repo)

    await mgr.ensureRunning('acc-1')
    d.resolve('auth_timeout')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'auth_timeout')
  })

  it('records a stopped session and rethrows when startFn fails', async () => {
    const repo = sessionRepo()
    const startFn = vi.fn().mockRejectedValue(new Error('no valid credentials'))
    const mgr = new SessionManager(startFn, repo)

    await expect(mgr.ensureRunning('acc-1')).rejects.toThrow('no valid credentials')
    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'no valid credentials')
    expect(repo.markRunning).not.toHaveBeenCalled()
    expect(mgr.isRunning('acc-1')).toBe(false)
  })

  it('does not launch a second session while one is still starting', async () => {
    const repo = sessionRepo()
    const d = deferred<SessionHandle>()
    const startFn = vi.fn().mockReturnValue(d.promise)
    const mgr = new SessionManager(startFn, repo)

    const first = mgr.ensureRunning('acc-1')   // startFn in flight, not yet resolved
    const second = mgr.ensureRunning('acc-1')   // must await the in-flight start, not relaunch
    expect(mgr.isRunning('acc-1')).toBe(true)   // reported running while starting

    d.resolve({ stop: vi.fn(), done: new Promise<string>(() => {}) } as SessionHandle)
    await Promise.all([first, second])

    expect(startFn).toHaveBeenCalledTimes(1)
  })

  it('stopAll stops every live session', async () => {
    const repo = sessionRepo()
    const stop = vi.fn()
    const startFn = vi.fn().mockResolvedValue({ stop, done: new Promise<string>(() => {}) } as SessionHandle)
    const mgr = new SessionManager(startFn, repo)
    await mgr.ensureRunning('acc-1')

    mgr.stopAll()
    expect(stop).toHaveBeenCalled()
  })

  it('coerces non-Error rejections from done() to a string for markStopped', async () => {
    const repo = sessionRepo()
    const startFn = vi.fn().mockResolvedValue({
      stop: vi.fn(),
      done: Promise.reject('plain string failure'),
    } as SessionHandle)
    const mgr = new SessionManager(startFn, repo)

    await mgr.ensureRunning('acc-1')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'plain string failure')
  })

  it('logs session lifecycle at the right level (started=info, unclean stop=warn, crash/start-fail=error)', async () => {
    const repo = sessionRepo()
    const log = fakeLogger()

    // started -> info
    const d = deferred<string>()
    const started = new SessionManager(vi.fn().mockResolvedValue({ stop: vi.fn(), done: d.promise } as SessionHandle), repo, log)
    await started.ensureRunning('acc-1')
    expect(log.info).toHaveBeenCalledWith('session started', { accountId: 'acc-1' })

    // unclean stop -> warn
    d.resolve('logged_out')
    await new Promise((r) => setTimeout(r, 0))
    expect(log.warn).toHaveBeenCalledWith('session stopped', { accountId: 'acc-1', reason: 'logged_out' })

    // clean stop -> info
    const d2 = deferred<string>()
    const clean = new SessionManager(vi.fn().mockResolvedValue({ stop: vi.fn(), done: d2.promise } as SessionHandle), repo, log)
    await clean.ensureRunning('acc-2')
    d2.resolve('stop_requested')
    await new Promise((r) => setTimeout(r, 0))
    expect(log.info).toHaveBeenCalledWith('session stopped', { accountId: 'acc-2', reason: 'stop_requested' })

    // crash (done rejects) -> error
    const crashed = new SessionManager(vi.fn().mockResolvedValue({ stop: vi.fn(), done: Promise.reject(new Error('boom')) } as SessionHandle), repo, log)
    await crashed.ensureRunning('acc-3')
    await new Promise((r) => setTimeout(r, 0))
    expect(log.error).toHaveBeenCalledWith('session crashed', { accountId: 'acc-3', error: 'boom' })

    // start failure -> error
    const failed = new SessionManager(vi.fn().mockRejectedValue(new Error('no creds')), repo, log)
    await expect(failed.ensureRunning('acc-4')).rejects.toThrow('no creds')
    expect(log.error).toHaveBeenCalledWith('session start failed', { accountId: 'acc-4', error: 'no creds' })
  })

  it('logs max_runtime as a clean stop (info)', async () => {
    const repo = sessionRepo()
    const log = fakeLogger()
    const d = deferred<string>()
    const mgr = new SessionManager(vi.fn().mockResolvedValue({ stop: vi.fn(), done: d.promise } as SessionHandle), repo, log)
    await mgr.ensureRunning('acc-1')
    d.resolve('max_runtime')
    await new Promise((r) => setTimeout(r, 0))
    expect(log.info).toHaveBeenCalledWith('session stopped', { accountId: 'acc-1', reason: 'max_runtime' })
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('logs auth_timeout as an unclean stop (warn)', async () => {
    const repo = sessionRepo()
    const log = fakeLogger()
    const d = deferred<string>()
    const mgr = new SessionManager(vi.fn().mockResolvedValue({ stop: vi.fn(), done: d.promise } as SessionHandle), repo, log)
    await mgr.ensureRunning('acc-1')
    d.resolve('auth_timeout')
    await new Promise((r) => setTimeout(r, 0))
    expect(log.warn).toHaveBeenCalledWith('session stopped', { accountId: 'acc-1', reason: 'auth_timeout' })
  })

  it('catches a failure while recording the stop so it is not an unhandled rejection', async () => {
    const repo = { markRunning: vi.fn().mockResolvedValue(undefined), markStopped: vi.fn().mockRejectedValue(new Error('db down')) }
    const log = fakeLogger()
    const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), done: Promise.reject(new Error('boom')) } as SessionHandle)
    const mgr = new SessionManager(startFn, repo as any, log)

    await mgr.ensureRunning('acc-1')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalled()
    expect(log.error).toHaveBeenCalledWith('failed to record session stop', expect.objectContaining({ accountId: 'acc-1' }))
  })

  it('coerces non-Error rejections from startFn to a string for markStopped', async () => {
    const repo = sessionRepo()
    const startFn = vi.fn().mockRejectedValue('login_failed: raw string')
    const mgr = new SessionManager(startFn, repo)

    await expect(mgr.ensureRunning('acc-1')).rejects.toBe('login_failed: raw string')
    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'login_failed: raw string')
  })

  it('resetOrphanedSessions resets running rows to stopped and returns the count', async () => {
    const repo = sessionRepo()
    repo.markAllRunningStopped.mockResolvedValue(2)
    const log = fakeLogger()
    const mgr = new SessionManager(vi.fn(), repo, log)

    const count = await mgr.resetOrphanedSessions()

    expect(count).toBe(2)
    expect(repo.markAllRunningStopped).toHaveBeenCalledWith('process_restart')
    expect(log.info).toHaveBeenCalledWith('reset orphaned sessions on boot', { count: 2 })
  })

  it('resetOrphanedSessions logs nothing when no rows were orphaned', async () => {
    const repo = sessionRepo()
    repo.markAllRunningStopped.mockResolvedValue(0)
    const log = fakeLogger()
    const mgr = new SessionManager(vi.fn(), repo, log)

    expect(await mgr.resetOrphanedSessions()).toBe(0)
    expect(log.info).not.toHaveBeenCalled()
  })

  it('resetOrphanedSessions tolerates a missing logger when rows were reset', async () => {
    const repo = sessionRepo()
    repo.markAllRunningStopped.mockResolvedValue(1)
    const mgr = new SessionManager(vi.fn(), repo) // no logger

    expect(await mgr.resetOrphanedSessions()).toBe(1)
    expect(repo.markAllRunningStopped).toHaveBeenCalledWith('process_restart')
  })

  it('logs a stringified non-Error rejection when recording a session stop fails', async () => {
    const repo = sessionRepo()
    repo.markStopped.mockRejectedValue('db exploded') // non-Error rejection
    const log = fakeLogger()
    const d = deferred<string>()
    const handle = { stop: vi.fn(), done: d.promise, userId: 'user-1' } as SessionHandle
    const mgr = new SessionManager(vi.fn().mockResolvedValue(handle), repo, log)

    await mgr.ensureRunning('acc-1')
    d.resolve('logged_out')
    await new Promise((r) => setTimeout(r, 0))

    expect(log.error).toHaveBeenCalledWith('failed to record session stop', {
      accountId: 'acc-1',
      error: 'db exploded',
    })
  })

  describe('assisted persistent needs_attention routing', () => {
    const assistedHandle = (done: Promise<string>): SessionHandle =>
      ({ stop: vi.fn(), done, userId: 'user-1', assistedPersistent: true } as SessionHandle)

    it('parks an assisted session in needs_attention on auth_timeout and notifies', async () => {
      const repo = sessionRepo()
      const notifier = fakeNotifier()
      const d = deferred<string>()
      const mgr = new SessionManager(vi.fn().mockResolvedValue(assistedHandle(d.promise)), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      expect(notifier.emitStarted).toHaveBeenCalledWith({ accountId: 'acc-1', userId: 'user-1' })
      d.resolve('auth_timeout')
      await new Promise((r) => setTimeout(r, 0))

      expect(repo.markNeedsAttention).toHaveBeenCalledWith('acc-1', 'auth_timeout')
      expect(repo.markStopped).not.toHaveBeenCalled()
      expect(notifier.emitNeedsAttention).toHaveBeenCalledWith({ accountId: 'acc-1', userId: 'user-1', reason: 'auth_timeout', notify: true })
    })

    it('parks an assisted session in needs_attention on logged_out', async () => {
      const repo = sessionRepo()
      const notifier = fakeNotifier()
      const d = deferred<string>()
      const mgr = new SessionManager(vi.fn().mockResolvedValue(assistedHandle(d.promise)), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      d.resolve('logged_out')
      await new Promise((r) => setTimeout(r, 0))

      expect(repo.markNeedsAttention).toHaveBeenCalledWith('acc-1', 'logged_out')
    })

    it('parks an assisted session in needs_attention on a crash (rejected done)', async () => {
      const repo = sessionRepo()
      const notifier = fakeNotifier()
      const mgr = new SessionManager(
        vi.fn().mockResolvedValue(assistedHandle(Promise.reject(new Error('boom')))), repo, undefined, notifier,
      )

      await mgr.ensureRunning('acc-1')
      await new Promise((r) => setTimeout(r, 0))

      expect(repo.markNeedsAttention).toHaveBeenCalledWith('acc-1', 'boom')
    })

    it('marks an assisted session stopped (not attention) on a clean stop', async () => {
      const repo = sessionRepo()
      const notifier = fakeNotifier()
      const d = deferred<string>()
      const mgr = new SessionManager(vi.fn().mockResolvedValue(assistedHandle(d.promise)), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      d.resolve('stop_requested')
      await new Promise((r) => setTimeout(r, 0))

      expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'stop_requested')
      expect(repo.markNeedsAttention).not.toHaveBeenCalled()
      expect(notifier.emitStopped).toHaveBeenCalledWith({ accountId: 'acc-1', userId: 'user-1', reason: 'stop_requested' })
    })

    it('still emits the needs_attention alert when the DB write fails (e.g. missing migration)', async () => {
      const repo = sessionRepo()
      repo.markNeedsAttention.mockRejectedValue(new Error('violates check constraint'))
      const notifier = fakeNotifier()
      const log = fakeLogger()
      const d = deferred<string>()
      const mgr = new SessionManager(vi.fn().mockResolvedValue(assistedHandle(d.promise)), repo, log, notifier)

      await mgr.ensureRunning('acc-1')
      d.resolve('auth_timeout')
      await new Promise((r) => setTimeout(r, 0))

      // The dashboard event fires regardless of the DB failure, so the light still turns amber,
      // and the DB error is surfaced (not silently lost).
      expect(notifier.emitNeedsAttention).toHaveBeenCalledWith({ accountId: 'acc-1', userId: 'user-1', reason: 'auth_timeout', notify: true })
      expect(repo.markNeedsAttention).toHaveBeenCalledWith('acc-1', 'auth_timeout')
      expect(log.error).toHaveBeenCalled()
    })

    it('parks an assisted session without a userId without emitting a dashboard event', async () => {
      const repo = sessionRepo()
      const notifier = fakeNotifier()
      const d = deferred<string>()
      const handle = { stop: vi.fn(), done: d.promise, assistedPersistent: true } as SessionHandle
      const mgr = new SessionManager(vi.fn().mockResolvedValue(handle), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      d.resolve('auth_timeout')
      await new Promise((r) => setTimeout(r, 0))

      expect(repo.markNeedsAttention).toHaveBeenCalledWith('acc-1', 'auth_timeout')
      expect(notifier.emitNeedsAttention).not.toHaveBeenCalled()
    })

    it('does NOT park a non-assisted persistent session on auth_timeout (unchanged behavior)', async () => {
      const repo = sessionRepo()
      const notifier = fakeNotifier()
      const d = deferred<string>()
      const handle = { stop: vi.fn(), done: d.promise, userId: 'user-1', assistedPersistent: false } as SessionHandle
      const mgr = new SessionManager(vi.fn().mockResolvedValue(handle), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      d.resolve('auth_timeout')
      await new Promise((r) => setTimeout(r, 0))

      expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'auth_timeout')
      expect(repo.markNeedsAttention).not.toHaveBeenCalled()
    })

    it('parks an assisted session in needs_attention on watchdog_timeout and notifies', async () => {
      const repo = sessionRepo()
      const notifier = fakeNotifier()
      const d = deferred<string>()
      const mgr = new SessionManager(vi.fn().mockResolvedValue(assistedHandle(d.promise)), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      d.resolve('watchdog_timeout')
      await new Promise((r) => setTimeout(r, 0))

      expect(repo.markNeedsAttention).toHaveBeenCalledWith('acc-1', 'watchdog_timeout')
      expect(notifier.emitNeedsAttention).toHaveBeenCalledWith({ accountId: 'acc-1', userId: 'user-1', reason: 'watchdog_timeout', notify: true })
    })

    it('parks an assisted session on a manual kill but suppresses the Slack alert', async () => {
      const repo = sessionRepo()
      const notifier = fakeNotifier()
      const mgr = new SessionManager(
        vi.fn().mockResolvedValue(assistedHandle(Promise.reject(new Error('session_killed')))), repo, undefined, notifier,
      )

      await mgr.ensureRunning('acc-1')
      await new Promise((r) => setTimeout(r, 0))

      expect(repo.markNeedsAttention).toHaveBeenCalledWith('acc-1', 'session_killed')
      expect(notifier.emitNeedsAttention).toHaveBeenCalledWith({ accountId: 'acc-1', userId: 'user-1', reason: 'session_killed', notify: false })
    })
  })

  describe('recovery notification', () => {
    it('emits recovered when a session returns from needs_attention and authenticates', async () => {
      const repo = sessionRepo()
      repo.markRunning.mockResolvedValue('needs_attention')
      const notifier = fakeNotifier()
      const handle = { stop: vi.fn(), done: new Promise<string>(() => {}), userId: 'user-1', authenticated: Promise.resolve(true) } as SessionHandle
      const mgr = new SessionManager(vi.fn().mockResolvedValue(handle), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      await new Promise((r) => setTimeout(r, 0)) // let the authenticated.then microtask run

      expect(notifier.emitStarted).toHaveBeenCalledWith({ accountId: 'acc-1', userId: 'user-1' })
      expect(notifier.emitRecovered).toHaveBeenCalledWith({ accountId: 'acc-1', userId: 'user-1' })
    })

    it('does not emit recovered when the previous status was not needs_attention', async () => {
      const repo = sessionRepo()
      repo.markRunning.mockResolvedValue('stopped')
      const notifier = fakeNotifier()
      const handle = { stop: vi.fn(), done: new Promise<string>(() => {}), userId: 'user-1', authenticated: Promise.resolve(true) } as SessionHandle
      const mgr = new SessionManager(vi.fn().mockResolvedValue(handle), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      await new Promise((r) => setTimeout(r, 0))

      expect(notifier.emitRecovered).not.toHaveBeenCalled()
    })

    it('does not emit recovered when authentication never completes (resolves false)', async () => {
      const repo = sessionRepo()
      repo.markRunning.mockResolvedValue('needs_attention')
      const notifier = fakeNotifier()
      const handle = { stop: vi.fn(), done: new Promise<string>(() => {}), userId: 'user-1', authenticated: Promise.resolve(false) } as SessionHandle
      const mgr = new SessionManager(vi.fn().mockResolvedValue(handle), repo, undefined, notifier)

      await mgr.ensureRunning('acc-1')
      await new Promise((r) => setTimeout(r, 0))

      expect(notifier.emitRecovered).not.toHaveBeenCalled()
    })

    it('does not throw when authenticated rejects (defensive catch swallows it)', async () => {
      const repo = sessionRepo()
      repo.markRunning.mockResolvedValue('needs_attention')
      const notifier = fakeNotifier()
      const handle = { stop: vi.fn(), done: new Promise<string>(() => {}), userId: 'user-1', authenticated: Promise.reject(new Error('boom')) } as SessionHandle
      const mgr = new SessionManager(vi.fn().mockResolvedValue(handle), repo, undefined, notifier)

      await expect(mgr.ensureRunning('acc-1')).resolves.toBeUndefined()
      await new Promise((r) => setTimeout(r, 0))

      expect(notifier.emitRecovered).not.toHaveBeenCalled()
    })
  })

  describe('kill', () => {
    it('kills a live session and returns true', async () => {
      const repo = sessionRepo()
      const kill = vi.fn()
      const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), kill, done: new Promise<string>(() => {}) } as SessionHandle)
      const mgr = new SessionManager(startFn, repo)

      await mgr.ensureRunning('acc-1')
      expect(mgr.kill('acc-1')).toBe(true)
      expect(kill).toHaveBeenCalled()
    })

    it('returns false when no live session exists', () => {
      const mgr = new SessionManager(vi.fn(), sessionRepo())
      expect(mgr.kill('nope')).toBe(false)
    })
  })
})
