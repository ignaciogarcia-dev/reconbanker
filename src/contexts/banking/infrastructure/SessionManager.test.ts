import { describe, it, expect, vi } from 'vitest'
import { SessionManager, type SessionHandle } from './SessionManager.js'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const sessionRepo = () => ({ markRunning: vi.fn().mockResolvedValue(undefined), markStopped: vi.fn().mockResolvedValue(undefined) })
const fakeLogger = () => { const l: any = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => l }; return l }

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
})
