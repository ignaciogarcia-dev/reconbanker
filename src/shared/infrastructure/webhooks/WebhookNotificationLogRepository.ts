import type { QueryResult, QueryResultRow } from 'pg'
import { IWebhookNotificationLog, WebhookNotificationLogEntry } from './IWebhookNotificationLog.js'

// Minimal executor shape, kept local so shared infra does not depend on any
// bounded context. Structurally satisfied by every context's executorFromPool.
export interface Executor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<R>>
}

// Cap on the stored response body. Keeps a pathological multi-MB webhook
// response from bloating the audit table (one row per attempt, x retries).
const MAX_BODY_CHARS = 10_000

/**
 * Coerces a raw response body string into a value safe to cast to JSONB:
 * if it is already valid JSON (and within the size cap) it is passed through;
 * otherwise it is wrapped as a JSON string node so the column is always valid
 * JSONB. Oversized bodies are truncated and stored as a string node.
 */
function toJsonbParam(body: string | null): string | null {
  if (body === null) return null
  if (body.length > MAX_BODY_CHARS) {
    return JSON.stringify(body.slice(0, MAX_BODY_CHARS))
  }
  try {
    JSON.parse(body)
    return body
  } catch {
    return JSON.stringify(body)
  }
}

export class WebhookNotificationLogRepository implements IWebhookNotificationLog {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): WebhookNotificationLogRepository {
    return new WebhookNotificationLogRepository(tx)
  }

  async record(entry: WebhookNotificationLogEntry): Promise<void> {
    await this.executor.query(
      `INSERT INTO webhook_notifications
         (id, account_id, subject_type, subject_id, url, request_payload,
          response_status, response_body, error_message, attempt)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9)`,
      [
        entry.accountId,
        entry.subjectType,
        entry.subjectId,
        entry.url,
        JSON.stringify(entry.requestPayload),
        entry.responseStatus,
        toJsonbParam(entry.responseBody),
        entry.errorMessage,
        entry.attempt,
      ]
    )
  }
}
