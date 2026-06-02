import type { IBankSessionRepository } from '../domain/IBankSessionRepository.js'

export interface SessionHandle {
  stop(): void
  done: Promise<string> // resolves with a stop reason; may reject with an Error
}

export type StartSessionFn = (accountId: string) => Promise<SessionHandle>

/**
 * In-process registry of live persistent monitor sessions, keyed by accountId.
 * `ensureRunning` is idempotent: a no-op if a session is already alive OR currently
 * starting. When a session's `done` promise settles, the slot is freed and
 * bank_sessions updated. A `startFn` that throws is recorded as a stopped session
 * (with the failure reason) for operator visibility, then rethrown.
 */
export class SessionManager {
  private readonly live = new Map<string, SessionHandle>()
  // Tracks sessions whose startFn is in flight, so a concurrent ensureRunning for
  // the same account never launches a second browser against the same userDataDir
  // (which Chromium cannot share). Closes the window between the live-check and the
  // live.set that an `await startFn` would otherwise open.
  private readonly starting = new Map<string, Promise<void>>()

  constructor(
    private readonly startFn: StartSessionFn,
    private readonly sessionRepo: IBankSessionRepository,
  ) {}

  // Records a stopped session (with its stop reason) for operator visibility.
  private async recordStop(accountId: string, reason: string): Promise<void> {
    await this.sessionRepo.markStopped(accountId, reason)
  }

  isRunning(accountId: string): boolean {
    return this.live.has(accountId) || this.starting.has(accountId)
  }

  async ensureRunning(accountId: string): Promise<void> {
    if (this.live.has(accountId)) return
    const inflight = this.starting.get(accountId)
    if (inflight) return inflight

    const start = this.launch(accountId)
    this.starting.set(accountId, start)
    try {
      await start
    } finally {
      this.starting.delete(accountId)
    }
  }

  private async launch(accountId: string): Promise<void> {
    let handle: SessionHandle
    try {
      handle = await this.startFn(accountId)
    } catch (err) {
      // Record the failed start so operators can see why it isn't monitoring,
      // then rethrow so the job is marked failed.
      await this.recordStop(accountId, err instanceof Error ? err.message : String(err))
      throw err
    }

    this.live.set(accountId, handle)
    await this.sessionRepo.markRunning(accountId)

    handle.done
      // Resolve carries a MonitorStopReason (stop_requested|max_runtime|logged_out|
      // auth_timeout); reject carries a thrown error. Either way we just record the stop.
      .then((reason) => this.recordStop(accountId, reason))
      .catch((err) => this.recordStop(accountId, err instanceof Error ? err.message : String(err)))
      .finally(() => { this.live.delete(accountId) })
  }

  stopAll(): void {
    for (const handle of this.live.values()) handle.stop()
  }
}
