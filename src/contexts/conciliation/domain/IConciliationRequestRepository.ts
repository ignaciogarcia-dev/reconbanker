import { ConciliationRequest } from './ConciliationRequest.js'

export interface IConciliationRequestRepository {
  findById(id: string): Promise<ConciliationRequest | null>
  save(request: ConciliationRequest): Promise<void>
  cancelMissing(accountId: string, presentExternalIds: string[]): Promise<number>
}
