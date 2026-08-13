import { IScrapeStepRepository, StepOutcome } from '../domain/IScrapeStepRepository.js'
import type { ScrapeStage, StepStatus } from '../domain/scrapeStage.js'
import { Executor } from './Executor.js'

type TerminalStatus = Exclude<StepStatus, 'started'>

export class ScrapeStepRepository implements IScrapeStepRepository {
  constructor(private readonly executor: Executor) {}

  async start(runId: string, stepIndex: number, step: ScrapeStage): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_scrape_steps (run_id, step_index, step, status)
       VALUES ($1,$2,$3,'started')`,
      [runId, stepIndex, step]
    )
  }

  // Updates the row opened by start(). Scoped by (run_id, step_index) rather than by
  // step name: a run can visit the same stage many times and only this pair is unique.
  async finish(runId: string, stepIndex: number, status: TerminalStatus, outcome: StepOutcome = {}): Promise<void> {
    await this.executor.query(
      `UPDATE bank_scrape_steps
          SET status=$1, failure_type=$2, error_message=$3, stack=$4, url=$5, duration_ms=$6
        WHERE run_id=$7 AND step_index=$8`,
      [
        status,
        outcome.failureType ?? null,
        outcome.errorMessage ?? null,
        outcome.stack ?? null,
        outcome.url ?? null,
        outcome.durationMs ?? null,
        runId,
        stepIndex,
      ]
    )
  }

  async record(
    runId: string,
    stepIndex: number,
    step: ScrapeStage,
    status: TerminalStatus,
    outcome: StepOutcome = {}
  ): Promise<void> {
    await this.executor.query(
      `INSERT INTO bank_scrape_steps
         (run_id, step_index, step, status, failure_type, error_message, stack, url, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        runId,
        stepIndex,
        step,
        status,
        outcome.failureType ?? null,
        outcome.errorMessage ?? null,
        outcome.stack ?? null,
        outcome.url ?? null,
        outcome.durationMs ?? null,
      ]
    )
  }
}
