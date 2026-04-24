import { BankTransaction } from './BankTransaction.js'

export interface IBankTransactionRepository {
  findById(id: string, opts?: { forUpdate?: boolean }): Promise<BankTransaction | null>
  findByExternalId(accountId: string, externalId: string): Promise<BankTransaction | null>
  findLatestExternalId(accountId: string): Promise<string | null>
  save(tx: BankTransaction): Promise<void>
  markExcluded(id: string): Promise<void>
  isExcluded(id: string): Promise<boolean>
  markNotified(id: string): Promise<void>
  markAllNotified(accountId: string): Promise<void>
  isNotified(id: string): Promise<boolean>
}
