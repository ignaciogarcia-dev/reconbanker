import type { QueryResult, QueryResultRow } from 'pg'
import type { WebhookSubjectType } from './IWebhookNotificationLog.js'
import {
  IWebhookDeadLetterStore,
  WebhookDeadLetterEntry,
  WebhookDeadLetterRecord,
} from './IWebhookDeadLetterStore.js'

// Minimal executor shape, kept local so shared infra does not depend on any
// bounded context. Structurally satisfied by every context's executorFromPool.
export interface Executor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<R>>
}

interface DeadLetterRow {
  id: string
  account_id: string
  subject_type: WebhookSubjectType
  subject_id: string
  url: string | null
  last_status: number | null
  last_error: string | null
  attempts: number
  failed_at: Date
  resolved_at: Date | null
}

function toRecord(row: DeadLetterRow): WebhookDeadLetterRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    url: row.url,
    lastStatus: row.last_status,
    lastError: row.last_error,
    attempts: row.attempts,
    failedAt: row.failed_at,
    resolvedAt: row.resolved_at,
  }
}

export class WebhookDeadLetterRepository implements IWebhookDeadLetterStore {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): WebhookDeadLetterRepository {
    return new WebhookDeadLetterRepository(tx)
  }

  async record(entry: WebhookDeadLetterEntry): Promise<void> {
    // Upsert against the partial unique index on (subject_type, subject_id)
    // WHERE resolved_at IS NULL, so a repeated final failure of the same open
    // subject refreshes the row in place.
    await this.executor.query(
      `INSERT INTO webhook_dead_letters
         (id, account_id, subject_type, subject_id, url, last_status, last_error, attempts)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (subject_type, subject_id) WHERE resolved_at IS NULL
       DO UPDATE SET
         url         = EXCLUDED.url,
         last_status = EXCLUDED.last_status,
         last_error  = EXCLUDED.last_error,
         attempts    = EXCLUDED.attempts,
         failed_at   = now()`,
      [
        entry.accountId,
        entry.subjectType,
        entry.subjectId,
        entry.url,
        entry.lastStatus,
        entry.lastError,
        entry.attempts,
      ]
    )
  }

  async listUnresolved(accountId?: string): Promise<WebhookDeadLetterRecord[]> {
    const { rows } = accountId
      ? await this.executor.query<DeadLetterRow>(
          `SELECT * FROM webhook_dead_letters
           WHERE resolved_at IS NULL AND account_id = $1
           ORDER BY failed_at DESC`,
          [accountId]
        )
      : await this.executor.query<DeadLetterRow>(
          `SELECT * FROM webhook_dead_letters
           WHERE resolved_at IS NULL
           ORDER BY failed_at DESC`
        )
    return rows.map(toRecord)
  }

  async markResolved(subjectType: WebhookSubjectType, subjectId: string): Promise<void> {
    await this.executor.query(
      `UPDATE webhook_dead_letters
       SET resolved_at = now()
       WHERE subject_type = $1 AND subject_id = $2 AND resolved_at IS NULL`,
      [subjectType, subjectId]
    )
  }
}
