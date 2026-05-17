import { ConciliationRequest } from './ConciliationRequest.js'

export interface StaleRequestRef {
  id: string
  accountId: string
}

export interface IConciliationRequestRepository {
  findById(id: string): Promise<ConciliationRequest | null>
  findByIdForUpdate(id: string): Promise<ConciliationRequest | null>
  findActiveExternalIds(accountId: string): Promise<Set<string>>
  findPendingByAccount(accountId: string): Promise<ConciliationRequest[]>
  findStale(olderThan: Date, limit?: number): Promise<StaleRequestRef[]>
  hasActiveRequests(accountId: string): Promise<boolean>
  save(request: ConciliationRequest): Promise<void>
  cancelMissing(accountId: string, presentExternalIds: string[]): Promise<number>
}
