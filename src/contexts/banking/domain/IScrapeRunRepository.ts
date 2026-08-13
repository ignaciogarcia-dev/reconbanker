export interface IScrapeRunRepository {
  create(runId: string, accountId: string, scriptId: string): Promise<void>
  // stopReason carries the nuance (which MonitorStopReason, which harness cause) that
  // the three-valued status deliberately does not, mirroring bank_sessions.stop_reason.
  markSuccess(runId: string, transactionCount: number, stopReason?: string): Promise<void>
  markFailed(runId: string, errorMessage: string, failureType?: string, stopReason?: string): Promise<void>
}
