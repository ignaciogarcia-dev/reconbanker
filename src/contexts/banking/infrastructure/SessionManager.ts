import type { IBankSessionRepository } from '../domain/IBankSessionRepository.js'
import type { ISessionLifecycleNotifier } from '../domain/ports/ISessionLifecycleNotifier.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'

// Stop reasons that represent a clean exit vs an unexpected loss of session.
const CLEAN_STOP_REASONS = new Set(['stop_requested', 'max_runtime'])
// Non-clean stop reasons that, for an assisted persistent session, mean it could not
// reach/keep an authenticated state on its own and must wait for a human to reactivate.
const ATTENTION_REASONS = new Set(['auth_timeout', 'logged_out', 'watchdog_timeout'])

export interface SessionHandle {
  stop(): void
  // Present for persistent sessions: force-terminates the browser so a hung loop ends at once.
  kill?(): void
  done: Promise<string> // resolves with a stop reason; may reject with an Error
  // Present for persistent sessions: enables lifecycle events (drives the dashboard light).
  userId?: string
  // True only for persistent + assisted accounts: a non-clean stop parks in needs_attention
  // instead of being silently relaunched by the scheduler.
  assistedPersistent?: boolean
  // Present for persistent sessions: resolves true once the session re-authenticates, false if it
  // ends first. Never rejects. Used to fire the recovery notice only after real auth.
  authenticated?: Promise<boolean>
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
    private readonly notifier?: ISessionLifecycleNotifier,
  ) {}

  // Records a stopped session (with its stop reason) for operator visibility.
  private async recordStop(accountId: string, reason: string): Promise<void> {
    await this.sessionRepo.markStopped(accountId, reason)
  }

  // Routes a session end to either needs_attention (assisted persistent that lost/failed
  // login) or a plain stop, emitting the matching lifecycle event for the dashboard.
  private async handleEnd(
    accountId: string,
    handle: SessionHandle,
    reason: string,
    isCrash: boolean,
  ): Promise<void> {
    if (handle.assistedPersistent && (isCrash || ATTENTION_REASONS.has(reason))) {
      // Emit the dashboard alert first (fire-and-forget) so a failed DB write can't also swallow it.
      // A manual kill ('session_killed') still parks + drives the light via the WS event, but suppresses
      // the Slack alarm — the operator initiated it, so the alarm would be redundant noise.
      if (handle.userId) this.notifier?.emitNeedsAttention({ accountId, userId: handle.userId, reason, notify: reason !== 'session_killed' })
      await this.sessionRepo.markNeedsAttention(accountId, reason)
      return
    }
    if (handle.userId) this.notifier?.emitStopped({ accountId, userId: handle.userId, reason })
    await this.recordStop(accountId, reason)
  }

  isRunning(accountId: string): boolean {
    return this.live.has(accountId) || this.starting.has(accountId)
  }

  // Force-terminates a live session's browser so a hung monitor loop ends at once. Returns whether a
  // live session was found. `done` then rejects with 'session_killed', routing through handleEnd as a
  // crash (assisted → needs_attention without a Slack alarm; simple → stopped + scheduler relaunch).
  kill(accountId: string): boolean {
    const handle = this.live.get(accountId)
    if (!handle) return false
    handle.kill?.()
    return true
  }

  // Persistent monitor sessions run in-process, so none survive a restart. Any DB row still
  // marked 'running' at boot is orphaned; reset it to 'stopped' before the scheduler's first
  // tick so the dashboard light is accurate (simple persistent accounts then auto-relaunch;
  // assisted ones stay off until manually started). Returns how many rows were reset.
  async resetOrphanedSessions(): Promise<number> {
    const count = await this.sessionRepo.markAllRunningStopped('process_restart')
    if (count > 0) this.logger?.info('reset orphaned sessions on boot', { count })
    return count
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
    const previousStatus = await this.sessionRepo.markRunning(accountId)
    this.logger?.info('session started', { accountId })
    if (handle.userId) {
      this.notifier?.emitStarted({ accountId, userId: handle.userId })
      // A session returning from needs_attention is a recovery: notify once it actually
      // re-authenticates (2FA entered), not at launch. authenticated never rejects; an abandoned
      // reactivation resolves false and emits nothing.
      if (previousStatus === 'needs_attention' && handle.authenticated) {
        const userId = handle.userId
        void handle.authenticated.then((ok) => {
          if (ok) this.notifier?.emitRecovered({ accountId, userId })
        }).catch(() => {})
      }
    }

    handle.done
      // Resolve carries a MonitorStopReason (stop_requested|max_runtime|logged_out|
      // auth_timeout); reject carries a thrown error. handleEnd routes assisted persistent
      // login losses to needs_attention and everything else to a plain stop.
      .then((reason) => {
        const level = CLEAN_STOP_REASONS.has(reason) ? 'info' : 'warn'
        this.logger?.[level]('session stopped', { accountId, reason })
        return this.handleEnd(accountId, handle, reason, false)
      })
      .catch((err) => {
        const error = err instanceof Error ? err.message : String(err)
        this.logger?.error('session crashed', { accountId, error })
        return this.handleEnd(accountId, handle, error, true)
      })
      .finally(() => { this.live.delete(accountId) })
      // recordStop itself can reject (e.g. DB down); finally does not absorb it,
      // so without this trailing catch the rejection would be unhandled and can
      // (Node 18+) crash the process.
      .catch((err) => {
        this.logger?.error('failed to record session stop', {
          accountId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }

  stopAll(): void {
    for (const handle of this.live.values()) handle.stop()
  }
}
