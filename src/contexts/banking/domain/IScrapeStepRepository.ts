import type { ScrapeStage, StepStatus } from './scrapeStage.js'

export interface StepOutcome {
  failureType?: string
  errorMessage?: string
  stack?: string
  url?: string
  durationMs?: number
}

export interface IScrapeStepRepository {
  /** Opens a stage as in-progress, so a hang leaves a visible row rather than nothing. */
  start(runId: string, stepIndex: number, step: ScrapeStage): Promise<void>
  /** Closes a previously opened stage in place, keyed by (runId, stepIndex). */
  finish(runId: string, stepIndex: number, status: Exclude<StepStatus, 'started'>, outcome?: StepOutcome): Promise<void>
  /** Writes a stage that has no in-progress phase worth recording, in one statement. */
  record(runId: string, stepIndex: number, step: ScrapeStage, status: Exclude<StepStatus, 'started'>, outcome?: StepOutcome): Promise<void>
}
