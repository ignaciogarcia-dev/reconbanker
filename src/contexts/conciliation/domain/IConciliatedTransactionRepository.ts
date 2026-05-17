export interface ConciliatedTransactionData {
  id: string
  accountId: string
  requestId: string
  bankTransactionId: string
}

export interface PrimaryMatchRef {
  id: string
}

export interface IConciliatedTransactionRepository {
  save(match: ConciliatedTransactionData): Promise<void>
  findPrimaryByRequest(requestId: string): Promise<PrimaryMatchRef | null>
  markNotified(matchId: string): Promise<void>
}
