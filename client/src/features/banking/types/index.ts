export interface BankMovement {
  id: string
  externalId: string
  amount: number
  currency: string
  senderName: string | null
  receivedAt: string
  notifiedAt: string | null
  excludedAt: string | null
}
