import { BankTransaction } from './BankTransaction.js'
import type { Tx } from '../../../shared/persistence/index.js'

export interface IBankTransactionRepository {
  withTx(tx: Tx): IBankTransactionRepository
  findById(id: string, opts?: { forUpdate?: boolean }): Promise<BankTransaction | null>
  findByExternalId(accountId: string, externalId: string): Promise<BankTransaction | null>
  findLatestExternalId(accountId: string): Promise<string | null>
  // Returns true only if this call actually inserted the row. False means a
  // concurrent writer already had it (ON CONFLICT DO NOTHING) — callers must
  // not re-publish ingestion events in that case.
  save(tx: BankTransaction): Promise<boolean>
  markExcluded(id: string): Promise<void>
  isExcluded(id: string): Promise<boolean>
  markNotified(id: string): Promise<void>
  markAllNotified(accountId: string): Promise<void>
  isNotified(id: string): Promise<boolean>
  // Atomic CAS: returns true only if this call set notified_at. Prevents double-send under concurrent retries.
  claimNotification(id: string): Promise<boolean>
  // Reverts a claim so the next retry can attempt again.
  releaseNotification(id: string): Promise<void>
}
