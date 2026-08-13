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
 * What the harness needs in order to record a stage, expressed as the narrowest
 * possible surface so `script-engine` depends on a capability rather than on
 * `banking`'s recorder. ScrapeRunRecorder satisfies this.
 *
 * Extends ITrailSink because the harness owns the debug-log sink: the sink is where
 * every event a script emits passes through, so that is where the trail is filled.
 */
export interface IStageRecorder extends ITrailSink {
  stage<T>(step: ScrapeStage, fn: () => Promise<T>): Promise<T>
  /**
   * Reports the page the browser is on. Synchronous and I/O-free — the harness calls
   * it at the moment of failure, and the recorder decides whether it ends up on a row.
   */
  observeUrl(url: string): void
}
