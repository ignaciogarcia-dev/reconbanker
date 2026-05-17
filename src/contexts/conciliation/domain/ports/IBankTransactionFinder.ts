export interface BankTransactionCandidate {
  id: string
  amount: number
  currency: string
  senderName?: string
  receivedAt: Date
}

export interface BankTransactionView {
  id: string
  accountId: string
  amount: number
  currency: string
  senderName?: string
  receivedAt: Date
}

export interface IBankTransactionFinder {
  findCandidatesForAccount(accountId: string): Promise<BankTransactionCandidate[]>
  findById(id: string, opts?: { forUpdate?: boolean }): Promise<BankTransactionView | null>
  isExcluded(id: string): Promise<boolean>
  markExcluded(id: string): Promise<void>
}
