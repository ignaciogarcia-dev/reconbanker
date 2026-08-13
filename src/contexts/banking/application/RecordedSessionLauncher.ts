import crypto from 'crypto'
import type { ILogger } from '../../../shared/logger/ILogger.js'
import { IScrapeRunRepository } from '../domain/IScrapeRunRepository.js'
import { IScrapeStepRepository } from '../domain/IScrapeStepRepository.js'
import { outcomeFromStopReason } from '../domain/monitorStopOutcome.js'
import { ScrapeRunRecorder } from './ScrapeRunRecorder.js'

export interface RecordedSessionLauncherDeps {
  runRepo: IScrapeRunRepository
  stepRepo: IScrapeStepRepository
  logger?: ILogger
  /** Injectable so a test can assert on a known run id. */
  newRunId?: () => string
}

/**
 * All the launcher needs of a session handle: how to learn that it ended. Declared
 * structurally rather than importing SessionManager's SessionHandle, which would point
 * an application-layer module at infrastructure — and the generic below hands the
 * caller's own handle type straight back, so nothing is lost by narrowing here.
 */
export interface EndingSession {
  /** Resolves with a MonitorStopReason; rejects with a thrown error. */
  done: Promise<string>
}

/**
 * Gives a persistent monitor session a run record.
 *
 * Persistent accounts had no execution history at all: the scrape use case returns
 * early for them before creating a row, and both live bank scripts run this way — so
 * the accounts that matter most were the ones with no record.
 *
 * One row per **session lifetime**, not per poll cycle. The monitor authenticates once
 * and then polls indefinitely, so the session *is* the execution; a row per poll would
 * bury the table in near-identical rows.
 *
 * Opened here, on the launch path, and nowhere upstream of it: `ensureRunning` no-ops
 * on a live session and the persistent-session health-check calls it roughly every 75
 * seconds, so a row created there would orphan a row a minute.
 */
export class RecordedSessionLauncher {
  constructor(private readonly deps: RecordedSessionLauncherDeps) {}

  async launch<H extends EndingSession>(
    input: { accountId: string; scriptId: string },
    start: (recorder: ScrapeRunRecorder) => Promise<H>,
  ): Promise<H> {
    const runId = (this.deps.newRunId ?? (() => crypto.randomUUID()))()
    const recorder = new ScrapeRunRecorder({
      runId,
      runRepo: this.deps.runRepo,
      stepRepo: this.deps.stepRepo,
      logger: this.deps.logger,
    })

    // Best-effort like every other write here: failing to record a run must never be
    // the reason an account stops being monitored.
    try {
      await this.deps.runRepo.create(runId, input.accountId, input.scriptId)
    } catch (err) {
      this.warn('could not open a scrape run row', input.accountId, err)
    }

    let handle: H
    try {
      handle = await start(recorder)
    } catch (err) {
      // Everything before the monitor loop: credential resolution, browser launch,
      // script evaluation. The recorder already knows which stage threw, so this
      // records launch_failed / script_load_failed / credentials_failed rather than
      // a bare "unknown".
      await recorder.fail(err)
      throw err
    }

    // `done` resolves with a MonitorStopReason and rejects with a thrown error. Both
    // close the row. SessionManager attaches its own handlers to the same promise for
    // bank_sessions; these two are independent on purpose, so a diagnostics write
    // cannot interfere with per-account attention state.
    void handle.done
      .then((reason) => this.close(recorder, reason))
      .catch((err) => this.close(recorder, message(err), err))
      .catch((err) => this.warn('could not close the scrape run row', input.accountId, err))

    return handle
  }

  private async close(recorder: ScrapeRunRecorder, reason: string, error?: unknown): Promise<void> {
    const outcome = outcomeFromStopReason(reason)
    if (outcome.status === 'success') {
      // No transaction count: a persistent session ingests continuously over a lifetime
      // that can span days, so any single number here would be a lie. NULL reads as
      // "not counted", which is the truth; the transactions themselves are in
      // bank_transactions, tied to the account.
      await recorder.succeed(null, outcome.stopReason)
      return
    }
    await recorder.fail(error ?? new Error(reason), {
      failureType: outcome.failureType,
      stopReason: outcome.stopReason,
    })
  }

  private warn(what: string, accountId: string, err: unknown): void {
    this.deps.logger?.warn(what, { accountId, error: message(err) })
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
