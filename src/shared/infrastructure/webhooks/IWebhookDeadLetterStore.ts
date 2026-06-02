import type { WebhookSubjectType } from './IWebhookNotificationLog.js'

export interface WebhookDeadLetterEntry {
  accountId: string
  subjectType: WebhookSubjectType
  subjectId: string
  url: string | null
  /** Last HTTP status seen; null when the final failure was a transport error. */
  lastStatus: number | null
  lastError: string | null
  /** Total attempts made before the delivery was given up on. */
  attempts: number
}

export interface WebhookDeadLetterRecord extends WebhookDeadLetterEntry {
  id: string
  failedAt: Date
  resolvedAt: Date | null
}

export interface IWebhookDeadLetterStore {
  /**
   * Records a subject whose webhook delivery exhausted all retries. Idempotent
   * per unresolved subject: a repeated final failure refreshes the existing row
   * (status/error/attempts/failed_at) rather than creating a duplicate.
   */
  record(entry: WebhookDeadLetterEntry): Promise<void>
  /** Unresolved dead-letters, newest first; scoped to an account when given. */
  listUnresolved(accountId?: string): Promise<WebhookDeadLetterRecord[]>
  /** Marks a subject's live dead-letter resolved. No-op when none is open. */
  markResolved(subjectType: WebhookSubjectType, subjectId: string): Promise<void>
}
