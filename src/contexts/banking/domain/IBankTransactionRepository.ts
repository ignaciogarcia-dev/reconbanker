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
  // Atomically marca notified_at = now() si estaba NULL. Devuelve true si lo hizo, false si ya estaba notificada.
  // Usar para evitar doble notificación en webhooks idempotentes ante reintentos concurrentes.
  claimNotification(id: string): Promise<boolean>
  // Revierte notified_at a NULL. Usar para liberar el claim si el envío falla.
  releaseNotification(id: string): Promise<void>
}
