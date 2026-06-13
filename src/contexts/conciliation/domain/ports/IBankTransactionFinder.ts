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

import type { Tx } from '../../../../shared/persistence/index.js'

export interface IBankTransactionFinder {
  // Rebinds every query to the given transaction so FOR UPDATE locks and
  // markExcluded run on the unit-of-work connection (not an autocommit pooled
  // one, where the lock would release immediately).
  withTx(tx: Tx): IBankTransactionFinder
  findCandidatesForAccount(accountId: string): Promise<BankTransactionCandidate[]>
  findById(id: string, opts?: { forUpdate?: boolean }): Promise<BankTransactionView | null>
  isExcluded(id: string): Promise<boolean>
  markExcluded(id: string): Promise<void>
}
