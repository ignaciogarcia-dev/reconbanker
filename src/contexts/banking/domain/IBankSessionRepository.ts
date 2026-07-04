export interface IBankSessionRepository {
  // Marks the session running and returns the row's PREVIOUS status ('needs_attention' means this
  // was a recovery), or null when the row is newly inserted.
  markRunning(accountId: string): Promise<string | null>
  markStopped(accountId: string, reason: string): Promise<void>
  // Parks an assisted persistent session awaiting manual reactivation; reason is the stop cause.
  markNeedsAttention(accountId: string, reason: string): Promise<void>
  // Resets every still-'running' row to 'stopped' and returns how many were reset. Used at boot
  // to clear sessions orphaned by a process restart (in-process browsers can't survive one).
  markAllRunningStopped(reason: string): Promise<number>
}
