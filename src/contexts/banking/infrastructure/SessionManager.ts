import type { IBankSessionRepository } from '../domain/IBankSessionRepository.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'

// Stop reasons that represent a clean exit vs an unexpected loss of session.
const CLEAN_STOP_REASONS = new Set(['stop_requested', 'max_runtime'])

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
    private readonly logger?: ILogger,
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
      const error = err instanceof Error ? err.message : String(err)
      this.logger?.error('session start failed', { accountId, error })
      await this.recordStop(accountId, error)
      throw err
    }

    this.live.set(accountId, handle)
    await this.sessionRepo.markRunning(accountId)
    this.logger?.info('session started', { accountId })

    handle.done
      // Resolve carries a MonitorStopReason (stop_requested|max_runtime|logged_out|
      // auth_timeout); reject carries a thrown error. Either way we just record the stop.
      .then((reason) => {
        const level = CLEAN_STOP_REASONS.has(reason) ? 'info' : 'warn'
        this.logger?.[level]('session stopped', { accountId, reason })
        return this.recordStop(accountId, reason)
      })
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err)
        this.logger?.error('session crashed', { accountId, error })
        return this.recordStop(accountId, error)
      })
      .finally(() => { this.live.delete(accountId) })
  }

  stopAll(): void {
    for (const handle of this.live.values()) handle.stop()
  }
}
