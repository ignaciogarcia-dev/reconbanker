// Persists the consecutive-failure streak per account+group so the notifier can hold back the
// external alert until the threshold is reached and know when a recovery notice is owed.
export type FailureGroup = 'connection' | 'scrape'

export interface IScrapeFailureAlertStore {
  // Increments the group's streak (creating the row on the first failure) and returns the new
  // streak plus whether an alert was already sent for the current streak.
  recordFailure(accountId: string, group: FailureGroup): Promise<{ streak: number; alerted: boolean }>
  // Marks the group as alerted so further failures in the same streak stay silent.
  markAlerted(accountId: string, group: FailureGroup): Promise<void>
  // Resets the group on a successful scrape and reports whether it had alerted (i.e. a recovery is owed).
  clear(accountId: string, group: FailureGroup): Promise<{ wasAlerted: boolean }>
}
