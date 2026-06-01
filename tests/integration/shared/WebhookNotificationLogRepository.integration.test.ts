import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount, SeededUser } from '../helpers/seed.js'
import { WebhookNotificationLogRepository } from '../../../src/shared/infrastructure/webhooks/WebhookNotificationLogRepository.js'
import type { WebhookNotificationLogEntry } from '../../../src/shared/infrastructure/webhooks/IWebhookNotificationLog.js'

let user: SeededUser
let account: SeededAccount
let repo: WebhookNotificationLogRepository

function entry(overrides: Partial<WebhookNotificationLogEntry> = {}): WebhookNotificationLogEntry {
  return {
    accountId: account.id,
    subjectType: 'bank_transaction',
    subjectId: crypto.randomUUID(),
    url: 'https://hook.example.com',
    requestPayload: { id: 'tx-1', amount: 100 },
    responseStatus: 200,
    responseBody: '{"ok":true}',
    errorMessage: null,
    attempt: 1,
    ...overrides,
  }
}

describe('WebhookNotificationLogRepository (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    user = await seedUser({ email: `whn-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    repo = new WebhookNotificationLogRepository({
      query: (text, params) => getTestPool().query(text, params as any),
    })
  })
  afterAll(async () => { await closeTestPool() })

  it('persists an entry and round-trips JSONB payload and response body', async () => {
    const e = entry()
    await repo.record(e)
    const { rows } = await getTestPool().query(
      'SELECT * FROM webhook_notifications WHERE subject_id = $1',
      [e.subjectId]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].account_id).toBe(account.id)
    expect(rows[0].subject_type).toBe('bank_transaction')
    expect(rows[0].response_status).toBe(200)
    expect(rows[0].attempt).toBe(1)
    expect(rows[0].error_message).toBeNull()
    expect(rows[0].request_payload).toEqual({ id: 'tx-1', amount: 100 })
    expect(rows[0].response_body).toEqual({ ok: true })
  })

  it('wraps a non-JSON response body as a JSON string node', async () => {
    const e = entry({ responseBody: 'plain text' })
    await repo.record(e)
    const { rows } = await getTestPool().query(
      'SELECT response_body FROM webhook_notifications WHERE subject_id = $1',
      [e.subjectId]
    )
    expect(rows[0].response_body).toBe('plain text')
  })

  it('stores null response on a network failure', async () => {
    const e = entry({ responseStatus: null, responseBody: null, errorMessage: 'ECONNRESET' })
    await repo.record(e)
    const { rows } = await getTestPool().query(
      'SELECT response_status, response_body, error_message FROM webhook_notifications WHERE subject_id = $1',
      [e.subjectId]
    )
    expect(rows[0].response_status).toBeNull()
    expect(rows[0].response_body).toBeNull()
    expect(rows[0].error_message).toBe('ECONNRESET')
  })

  it('is append-only: multiple attempts produce multiple rows', async () => {
    const subjectId = crypto.randomUUID()
    await repo.record(entry({ subjectId, responseStatus: 500, errorMessage: 'first', attempt: 1 }))
    await repo.record(entry({ subjectId, responseStatus: 200, errorMessage: null, attempt: 2 }))
    const { rows } = await getTestPool().query(
      'SELECT attempt, response_status FROM webhook_notifications WHERE subject_id = $1 ORDER BY attempt',
      [subjectId]
    )
    expect(rows.map(r => r.attempt)).toEqual([1, 2])
  })

  it('cascades on account deletion (FK ON DELETE CASCADE)', async () => {
    const e = entry()
    await repo.record(e)
    await getTestPool().query('DELETE FROM accounts WHERE id = $1', [account.id])
    const { rows } = await getTestPool().query(
      'SELECT 1 FROM webhook_notifications WHERE subject_id = $1',
      [e.subjectId]
    )
    expect(rows).toHaveLength(0)
  })
})
