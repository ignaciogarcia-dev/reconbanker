import type { ITrailSink } from './failureTrail.js'

/**
 * The stages a bank script run can be recorded at, mirroring the CHECK constraint on
 * bank_scrape_steps.step.
 *
 * Lives in the shared kernel because both contexts need it: `banking` owns the
 * recording, while `script-engine` owns the harness stages (launch, load_script,
 * close) that surround the script body. Duplicating the list per context would let
 * the two drift out of step with the database constraint.
 *
 * Emitted by the harness, never by scripts: requiring script authors to adopt a
 * vocabulary is the same dependency on author diligence that the automatic baseline
 * exists to remove. Script event names stay free-form and never reach this column.
 *
 * Covers both contracts — `navigate`/`movements_fetch`/`detail_extraction` describe a
 * legacy one-shot scrape, `login`/`auth_wait`/`poll`/`keep_alive` a persistent monitor,
 * and `launch`/`load_script`/`credentials`/`close` the harness around either.
 */
export const SCRAPE_STAGES = [
  'launch', 'load_script', 'credentials', 'login', 'auth_wait', 'poll',
  'keep_alive', 'navigate', 'movements_fetch', 'detail_extraction', 'close',
] as const

export type ScrapeStage = (typeof SCRAPE_STAGES)[number]

export type StepStatus = 'started' | 'success' | 'failed'

/**
 * A stage that has been opened and not yet closed. Returned by `beginStage` for the one
 * shape `stage()` cannot express: a stage whose outcome is a *return value* rather than a
 * thrown error. The monitor's authentication wait is exactly that — it times out by
 * falling out of a loop, which `stage()` would record as a success.
 */
export interface OpenStage {
  finish(status: Exclude<StepStatus, 'started'>, outcome?: StageOutcome): Promise<void>
}

/**
 * The failure detail a harness can attach to a stage it closes itself. Deliberately
 * narrower than banking's StepOutcome: the harness has no stack for a failure nobody
 * threw, and the recorder owns the timing.
 */
export interface StageOutcome {
  failureType?: string
  errorMessage?: string
  url?: string
}

/**
 * What the harness needs in order to record a stage, expressed as the narrowest
 * possible surface so `script-engine` depends on a capability rather than on
 * `banking`'s recorder. ScrapeRunRecorder satisfies this.
 *
 * Extends ITrailSink because the harness owns the debug-log sink: the sink is where
 * every event a script emits passes through, so that is where the trail is filled.
 */
export interface IStageRecorder extends ITrailSink {
  stage<T>(step: ScrapeStage, fn: () => Promise<T>): Promise<T>
  /** Opens a stage the caller will close itself. See OpenStage. */
  beginStage(step: ScrapeStage): OpenStage
  /**
   * Records a stage with no in-progress phase worth a row — a poll that failed, say.
   * A poll writes no `started` row because a hung poll already trips the monitor's
   * watchdog, which writes the failed row itself; two rows a minute per account would
   * buy nothing.
   */
  note(step: ScrapeStage, status: Exclude<StepStatus, 'started'>, outcome?: StageOutcome): Promise<void>
  /**
   * Reports the page the browser is on. Synchronous and I/O-free — the harness calls
   * it at the moment of failure, and the recorder decides whether it ends up on a row.
   */
  observeUrl(url: string): void
}
