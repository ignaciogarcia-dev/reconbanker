import type { IBankSessionRepository } from '../domain/IBankSessionRepository.js'
import type { IAccountScrapeBlocker } from '../domain/ports/IAccountScrapeBlocker.js'
import { isFatalScrapeError } from '../domain/isFatalScrapeError.js'

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
    private readonly blocker: IAccountScrapeBlocker,
  ) {}

  // Records a stopped session and, if the failure is fatal (e.g. bad credentials),
  // blocks the account so the health-check stops relaunching it until an operator
  // restarts. The block write is best-effort so it can never break session cleanup.
  private async recordStop(accountId: string, reason: string): Promise<void> {
    await this.sessionRepo.markStopped(accountId, reason)
    if (isFatalScrapeError(reason)) {
      await this.blocker.block(accountId, reason).catch(() => {})
    }
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
      // Record the failed start (and block the account if fatal) so operators can
      // see why it isn't monitoring, then rethrow so the job is marked failed.
      await this.recordStop(accountId, err instanceof Error ? err.message : String(err))
      throw err
    }

    this.live.set(accountId, handle)
    await this.sessionRepo.markRunning(accountId)

    handle.done
      // Resolve carries a MonitorStopReason (stop_requested|max_runtime|logged_out|
      // auth_timeout) — never fatal, so it never blocks the account.
      .then((reason) => this.sessionRepo.markStopped(accountId, reason))
      // Reject carries a thrown error (e.g. a fatal login failure) — recordStop
      // blocks the account when the message is fatal.
      .catch((err) => this.recordStop(accountId, err instanceof Error ? err.message : String(err)))
      .finally(() => { this.live.delete(accountId) })
  }

  stopAll(): void {
    for (const handle of this.live.values()) handle.stop()
  }
}
