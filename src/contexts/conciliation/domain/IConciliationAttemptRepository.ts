export interface ConciliationAttemptData {
  id: string
  accountId: string
  requestId: string
  attemptNumber: number
  status: 'success' | 'no_match' | 'ambiguous'
  failureType?: string
  candidateIds: string[]
  selectedTransactionId?: string
}

export interface IConciliationAttemptRepository {
  save(attempt: ConciliationAttemptData): Promise<void>
}
