export type WebhookSubjectType = 'bank_transaction' | 'conciliation_request'

export interface WebhookNotificationLogEntry {
  accountId: string
  subjectType: WebhookSubjectType
  subjectId: string
  url: string
  requestPayload: Record<string, unknown>
  responseStatus: number | null
  /** Raw response body string; the repository parses-or-wraps it into JSONB. */
  responseBody: string | null
  errorMessage: string | null
  /** BullMQ attempt number (1-based). */
  attempt: number
}

export interface IWebhookNotificationLog {
  record(entry: WebhookNotificationLogEntry): Promise<void>
}
