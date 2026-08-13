import type { ILogger } from '../../../shared/logger/ILogger.js'
import type { IFailureTrail, TrailEntry } from '../../../shared/domain/failureTrail.js'
import { IScrapeRunRepository } from '../domain/IScrapeRunRepository.js'
import { IScrapeStepRepository, StepOutcome } from '../domain/IScrapeStepRepository.js'
import { categorizeFailure } from '../domain/scrapeFailure.js'
import { ScrapeStage, stageFromFailureCategory } from '../domain/scrapeStage.js'
import { TrailBuffer } from './TrailBuffer.js'

export interface FailOptions {
  /** The page the browser was on when it broke — the cheapest field for reproducing it. */
  url?: string
  /** Harness-visible stage, used when the error names no stage of its own. */
  stage?: ScrapeStage
  /** Overrides the derived category (e.g. a monitor stop reason that is a failure). */
  failureType?: string
  stopReason?: string
}

/**
 * What the run was judged to be. Stamped on the flushed trail line so that reading the
 * trail and reading the conclusion do not require two lookups.
 */
interface FailureVerdict {
  stage?: ScrapeStage
  failureType: string
  stopReason?: string
  url?: string
}

export interface ScrapeRunRecorderDeps {
  runId: string
  runRepo: IScrapeRunRepository
  stepRepo: IScrapeStepRepository
  logger?: ILogger
  now?: () => number
  /** Defaults to a fresh TrailBuffer; injectable so a caller can inspect what was buffered. */
  trail?: IFailureTrail
}

// A failure in the harness around the script body is not "unknown" — it names its own
// cause. Applied only when the error carries no category of its own.
const HARNESS_FAILURE_TYPE: Partial<Record<ScrapeStage, string>> = {
  launch: 'launch_failed',
  load_script: 'script_load_failed',
  credentials: 'credentials_failed',
}

/**
 * Records one bank script execution: run identity, step ordering, and the terminal
 * outcome. The harness calls this, which is what makes the checkpoint baseline
 * guaranteed rather than dependent on what a script author remembered to log.
 *
 * Every write is best-effort. A diagnostics failure must never change scrape
 * behaviour — the scrape use case deliberately swallows scrape failures so the
 * scheduler can retry, and an exception thrown from here would defeat that.
 */
export class ScrapeRunRecorder {
  private stepIndex = 0
  private closed = false
  private lastUrl?: string
  private failedStage?: ScrapeStage
  private readonly trail: IFailureTrail

  constructor(private readonly deps: ScrapeRunRecorderDeps) {
    this.trail = deps.trail ?? new TrailBuffer()
  }

  get runId(): string {
    return this.deps.runId
  }

  observeUrl(url: string): void {
    if (url) this.lastUrl = url
  }

  /** Buffers one event. No I/O — this runs on every line a script emits. */
  event(entry: TrailEntry): void {
    this.trail.event(entry)
  }

  private get clock(): () => number {
    return this.deps.now ?? Date.now
  }

  // Swallow-and-log. Named so the intent is obvious at each call site.
  private async bestEffort(what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn()
    } catch (err) {
      this.deps.logger?.warn('scrape diagnostics write failed', {
        runId: this.deps.runId,
        operation: what,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * Runs `fn` as a recorded stage: opens an in-progress row, times it, and closes it
   * on either outcome. Instrumenting a stage is wrapping it.
   *
   * The in-progress row is what makes a hang visible — if the process dies inside
   * `fn`, the row stays `started` and names the stage it died in.
   */
  async stage<T>(step: ScrapeStage, fn: () => Promise<T>): Promise<T> {
    const index = this.stepIndex++
    const startedAt = this.clock()
    await this.bestEffort(`start:${step}`, () => this.deps.stepRepo.start(this.deps.runId, index, step))

    try {
      const result = await fn()
      await this.bestEffort(`finish:${step}`, () =>
        this.deps.stepRepo.finish(this.deps.runId, index, 'success', { durationMs: this.clock() - startedAt })
      )
      return result
    } catch (err) {
      // Remember the harness stage so fail() can name the cause when the error itself
      // carries no category — a browser that would not launch is not an "unknown" failure.
      this.failedStage ??= step
      await this.bestEffort(`finish:${step}`, () =>
        this.deps.stepRepo.finish(this.deps.runId, index, 'failed', {
          ...describe(err),
          url: this.lastUrl,
          durationMs: this.clock() - startedAt,
        })
      )
      throw err
    }
  }

  /** Records a stage that has no in-progress phase worth a row — a poll that failed, say. */
  async note(step: ScrapeStage, status: 'success' | 'failed', outcome: StepOutcome = {}): Promise<void> {
    const index = this.stepIndex++
    await this.bestEffort(`record:${step}`, () =>
      this.deps.stepRepo.record(this.deps.runId, index, step, status, outcome)
    )
  }

  async succeed(transactionsFound: number, stopReason?: string): Promise<void> {
    if (this.closed) return
    this.closed = true
    // A run that worked explains nothing, so the trail is dropped rather than written.
    this.trail.drain()
    await this.bestEffort('markSuccess', () =>
      this.deps.runRepo.markSuccess(this.deps.runId, transactionsFound, stopReason)
    )
  }

  /**
   * Closes the run as failed. When the error names a stage of its own — scripts encode
   * the category as their thrown-message prefix — a step row is added for it, so a
   * failure inside an otherwise opaque script call still lands on a stage.
   */
  async fail(err: unknown, opts: FailOptions = {}): Promise<void> {
    if (this.closed) return
    this.closed = true

    const category = categorizeFailure(err)
    const derived = stageFromFailureCategory(category)
    const stage = derived ?? opts.stage ?? this.failedStage
    const url = opts.url ?? this.lastUrl

    // Precedence: an explicit override, then the category the script encoded, then the
    // harness stage that failed. Only the last of those can turn 'unknown' into a cause.
    const failureType =
      opts.failureType
      ?? (category === 'unknown' && stage ? HARNESS_FAILURE_TYPE[stage] ?? category : category)

    const detail = describe(err)

    // Flushed before the database writes: the trail is the one artifact that exists
    // only in memory, so it is the one worth getting out first.
    this.flushTrail({ stage, failureType, stopReason: opts.stopReason, url })


    // stage() already wrote a row for a stage it wrapped; don't duplicate it.
    if (stage && stage !== this.failedStage) {
      await this.note(stage, 'failed', { ...detail, failureType, url })
    }

    await this.bestEffort('markFailed', () =>
      this.deps.runRepo.markFailed(this.deps.runId, detail.errorMessage ?? '', failureType, opts.stopReason)
    )
  }

  /**
   * Writes the buffered trail as exactly one `error` entry.
   *
   * One entry, not one per event: it lands atomically so it cannot interleave with a
   * concurrent account's output, it is retrievable by run id alone
   * (`grep <runId> logs/error-*.log`), and one failure costs one line against the
   * existing 14-day rotation. The log file rather than a database column, because the
   * trail carries counterparty names and account numbers — rotating that exposure out
   * beats storing it forever in a table nothing prunes on the same schedule.
   */
  private flushTrail(verdict: FailureVerdict): void {
    // Guarded like every other write here, and for a sharper reason: this runs *before*
    // markFailed, and `closed` is already set. A throw escaping here would abort fail()
    // and leave the run stuck in `running` until the next boot reconciliation — losing
    // the failure record itself in order to report a logging problem.
    try {
      const trail = this.trail.drain()
      if (!trail.length) return
      this.deps.logger?.error('failure_trail', {
        runId: this.deps.runId, ...verdict, events: trail.length, trail,
      })
    } catch {
      // Nowhere left to report it: the logger is what just failed.
    }
  }
}

function describe(err: unknown): Pick<StepOutcome, 'errorMessage' | 'stack'> {
  if (err instanceof Error) return { errorMessage: err.message, stack: err.stack }
  return { errorMessage: String(err) }
}
