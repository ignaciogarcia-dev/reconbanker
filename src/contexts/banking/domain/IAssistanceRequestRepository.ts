import { AssistanceRequest, OtpDescriptor } from './AssistanceRequest.js'

export interface IAssistanceRequestRepository {
  // A re-request bumps `attempts` on the single pending row instead of duplicating
  open(accountId: string, descriptor: OtpDescriptor, sessionId?: string | null): Promise<AssistanceRequest>
  // The current pending request for an account if any
  findPending(accountId: string): Promise<AssistanceRequest | null>
  markFulfilled(id: string): Promise<void>
  // Terminal non-success close
  close(id: string, status: 'cancelled' | 'expired'): Promise<void>
}
