import { describe, it, expect, vi } from 'vitest'
import { SessionManager, type SessionHandle } from './SessionManager.js'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const sessionRepo = () => ({ markRunning: vi.fn().mockResolvedValue(undefined), markStopped: vi.fn().mockResolvedValue(undefined) })
const blockerMock = () => ({ block: vi.fn().mockResolvedValue(undefined) })

describe('SessionManager', () => {
  it('starts a session, marks it running, and is idempotent while alive', async () => {
    const repo = sessionRepo()
    const d = deferred<string>()
    const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), done: d.promise } as SessionHandle)
    const mgr = new SessionManager(startFn, repo, blockerMock())

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
    const blocker = blockerMock()
    const mgr = new SessionManager(startFn, repo, blocker)

    await mgr.ensureRunning('acc-1')
    d.resolve('logged_out')
    await new Promise((r) => setTimeout(r, 0)) // let the .finally settle

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'logged_out')
    expect(blocker.block).not.toHaveBeenCalled() // logged_out is transient, not fatal
    expect(mgr.isRunning('acc-1')).toBe(false)
  })

  it('marks stopped with the error message when the session rejects (transient → no block)', async () => {
    const repo = sessionRepo()
    const blocker = blockerMock()
    const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), done: Promise.reject(new Error('boom')) } as SessionHandle)
    const mgr = new SessionManager(startFn, repo, blocker)

    await mgr.ensureRunning('acc-1')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'boom')
    expect(blocker.block).not.toHaveBeenCalled()
    expect(mgr.isRunning('acc-1')).toBe(false)
  })

  it('blocks the account when the session rejects with a fatal login error', async () => {
    const repo = sessionRepo()
    const blocker = blockerMock()
    const startFn = vi.fn().mockResolvedValue({
      stop: vi.fn(),
      done: Promise.reject(new Error('login_failed: bad password')),
    } as SessionHandle)
    const mgr = new SessionManager(startFn, repo, blocker)

    await mgr.ensureRunning('acc-1')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'login_failed: bad password')
    expect(blocker.block).toHaveBeenCalledWith('acc-1', 'login_failed: bad password')
  })

  it('does not block when the session resolves with auth_timeout', async () => {
    const repo = sessionRepo()
    const blocker = blockerMock()
    const d = deferred<string>()
    const startFn = vi.fn().mockResolvedValue({ stop: vi.fn(), done: d.promise } as SessionHandle)
    const mgr = new SessionManager(startFn, repo, blocker)

    await mgr.ensureRunning('acc-1')
    d.resolve('auth_timeout')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'auth_timeout')
    expect(blocker.block).not.toHaveBeenCalled()
  })

  it('records a stopped session, blocks the account, and rethrows when startFn fails fatally', async () => {
    const repo = sessionRepo()
    const blocker = blockerMock()
    const startFn = vi.fn().mockRejectedValue(new Error('no valid credentials'))
    const mgr = new SessionManager(startFn, repo, blocker)

    await expect(mgr.ensureRunning('acc-1')).rejects.toThrow('no valid credentials')
    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'no valid credentials')
    expect(blocker.block).toHaveBeenCalledWith('acc-1', 'no valid credentials')
    expect(repo.markRunning).not.toHaveBeenCalled()
    expect(mgr.isRunning('acc-1')).toBe(false)
  })

  it('does not launch a second session while one is still starting', async () => {
    const repo = sessionRepo()
    const d = deferred<SessionHandle>()
    const startFn = vi.fn().mockReturnValue(d.promise)
    const mgr = new SessionManager(startFn, repo, blockerMock())

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
    const mgr = new SessionManager(startFn, repo, blockerMock())
    await mgr.ensureRunning('acc-1')

    mgr.stopAll()
    expect(stop).toHaveBeenCalled()
  })

  it('coerces non-Error rejections from done() to a string for markStopped', async () => {
    const repo = sessionRepo()
    const blocker = blockerMock()
    const startFn = vi.fn().mockResolvedValue({
      stop: vi.fn(),
      done: Promise.reject('plain string failure'),
    } as SessionHandle)
    const mgr = new SessionManager(startFn, repo, blocker)

    await mgr.ensureRunning('acc-1')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'plain string failure')
    expect(blocker.block).not.toHaveBeenCalled()
  })

  it('coerces non-Error rejections from startFn to a string for markStopped', async () => {
    const repo = sessionRepo()
    const blocker = blockerMock()
    const startFn = vi.fn().mockRejectedValue('login_failed: raw string')
    const mgr = new SessionManager(startFn, repo, blocker)

    await expect(mgr.ensureRunning('acc-1')).rejects.toBe('login_failed: raw string')
    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'login_failed: raw string')
    expect(blocker.block).toHaveBeenCalledWith('acc-1', 'login_failed: raw string')
  })

  it('does not crash when blocker.block itself rejects (best-effort)', async () => {
    const repo = sessionRepo()
    const blocker = { block: vi.fn().mockRejectedValue(new Error('block-db-down')) }
    const startFn = vi.fn().mockResolvedValue({
      stop: vi.fn(),
      done: Promise.reject(new Error('login_failed: bad password')),
    } as SessionHandle)
    const mgr = new SessionManager(startFn, repo, blocker)

    await mgr.ensureRunning('acc-1')
    await new Promise((r) => setTimeout(r, 0))

    expect(repo.markStopped).toHaveBeenCalledWith('acc-1', 'login_failed: bad password')
    expect(blocker.block).toHaveBeenCalled()
    expect(mgr.isRunning('acc-1')).toBe(false)
  })
})
