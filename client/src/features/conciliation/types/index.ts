export type ConciliationStatus =
  | 'pending' | 'processing' | 'matched'
  | 'not_found' | 'ambiguous' | 'failed' | 'expired' | 'cancelled'

export interface ConciliationRequestListItem {
  id: string
  accountId: string
  externalId: string
  expectedAmount: number
  currency: string
  senderName: string | null
  status: ConciliationStatus
  retryCount: number
  lastCheckedAt: string | null
  createdAt: string
  bank: string | null
  accountName: string | null
}

export interface ConciliationAttempt {
  id: string
  attemptNumber: number
  status: string
  failureType: string | null
  candidateIds: string[]
  selectedTransactionId: string | null
  createdAt: string
}

export interface ConciliationMatch {
  id: string
  bankTransactionId: string
  amount: number
  currency: string
  senderName: string | null
  receivedAt: string
  isPrimary: boolean
  isNotified: boolean
  matchedAt: string
}

export interface ConciliationRequestDetail extends ConciliationRequestListItem {
  attempts: ConciliationAttempt[]
  match: ConciliationMatch | null
}

export interface ListFilter {
  status?: string
  limit?: number
  offset?: number
}
