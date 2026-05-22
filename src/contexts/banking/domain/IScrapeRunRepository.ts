export interface IScrapeRunRepository {
  create(runId: string, accountId: string, scriptId: string): Promise<void>
  markSuccess(runId: string, transactionCount: number): Promise<void>
  markFailed(runId: string, errorMessage: string, failureType?: string): Promise<void>
}
