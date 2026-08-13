export interface IScrapeRunRepository {
  create(runId: string, accountId: string, scriptId: string): Promise<void>
  // stopReason carries the nuance (which MonitorStopReason, which harness cause) that
  // the three-valued status deliberately does not, mirroring bank_sessions.stop_reason.
  // A null count means "not counted": a persistent session ingests over a lifetime that
  // can span days, so no single number describes the run.
  markSuccess(runId: string, transactionCount: number | null, stopReason?: string): Promise<void>
  markFailed(runId: string, errorMessage: string, failureType?: string, stopReason?: string): Promise<void>
  /**
   * Closes every run still marked running. Correct only at boot: live sessions are
   * held in an in-process registry, so a restart invalidates all of them by
   * definition. Returns how many were reconciled.
   */
  markOrphaned(): Promise<number>
  /** Deletes runs older than `days`; step rows follow via cascade. Returns the count. */
  pruneOlderThan(days: number): Promise<number>
}
