export interface IBankSessionRepository {
  markRunning(accountId: string): Promise<void>
  markStopped(accountId: string, reason: string): Promise<void>
}
