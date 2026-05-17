export interface ConciliationRequestListItemDto {
  id: string
  accountId: string
  externalId: string
  expectedAmount: number
  currency: string
  senderName: string | null
  status: string
  retryCount: number
  lastCheckedAt: Date | null
  createdAt: Date
  bank: string | null
  accountName: string | null
}

export interface ConciliationAttemptDto {
  id: string
  attemptNumber: number
  status: string
  failureType: string | null
  candidateIds: string[]
  selectedTransactionId: string | null
  createdAt: Date
}

export interface ConciliationMatchDto {
  id: string
  bankTransactionId: string
  amount: number
  currency: string
  senderName: string | null
  receivedAt: Date
  isPrimary: boolean
  isNotified: boolean
  matchedAt: Date
}

export interface ConciliationRequestDetailDto extends ConciliationRequestListItemDto {
  attempts: ConciliationAttemptDto[]
  match: ConciliationMatchDto | null
}

export interface ListConciliationRequestsFilter {
  userId: string
  status?: string
  limit: number
  offset: number
}
