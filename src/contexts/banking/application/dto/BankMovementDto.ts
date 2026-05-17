export interface BankMovementListItemDto {
  id: string
  externalId: string
  amount: number
  currency: string
  senderName: string | null
  receivedAt: Date
  notifiedAt: Date | null
  excludedAt: Date | null
}

export interface ListBankMovementsFilter {
  accountId: string
  limit: number
  offset: number
}
