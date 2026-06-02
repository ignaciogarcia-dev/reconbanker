import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount, SeededUser } from '../helpers/seed.js'
import { WebhookDeadLetterRepository } from '../../../src/shared/infrastructure/webhooks/WebhookDeadLetterRepository.js'
import type { WebhookDeadLetterEntry } from '../../../src/shared/infrastructure/webhooks/IWebhookDeadLetterStore.js'

let user: SeededUser
let account: SeededAccount
let repo: WebhookDeadLetterRepository

function entry(overrides: Partial<WebhookDeadLetterEntry> = {}): WebhookDeadLetterEntry {
  return {
    accountId: account.id,
    subjectType: 'bank_transaction',
    subjectId: crypto.randomUUID(),
    url: null,
    lastStatus: 500,
    lastError: 'Webhook failed: 500',
    attempts: 12,
    ...overrides,
  }
}

describe('WebhookDeadLetterRepository (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    user = await seedUser({ email: `wdl-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    repo = new WebhookDeadLetterRepository({
      query: (text, params) => getTestPool().query(text, params as any),
    })
  })
  afterAll(async () => { await closeTestPool() })

  it('records and lists an unresolved dead-letter', async () => {
    const e = entry()
    await repo.record(e)
    const out = await repo.listUnresolved(account.id)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      accountId: account.id,
      subjectType: 'bank_transaction',
      subjectId: e.subjectId,
      lastStatus: 500,
      lastError: 'Webhook failed: 500',
      attempts: 12,
      resolvedAt: null,
    })
  })

  it('upserts in place for a repeated final failure of the same open subject', async () => {
    const subjectId = crypto.randomUUID()
    await repo.record(entry({ subjectId, lastStatus: 500, attempts: 6 }))
    await repo.record(entry({ subjectId, lastStatus: 503, lastError: 'still down', attempts: 12 }))

    const { rows } = await getTestPool().query(
      'SELECT last_status, last_error, attempts FROM webhook_dead_letters WHERE subject_id = $1',
      [subjectId]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].last_status).toBe(503)
    expect(rows[0].last_error).toBe('still down')
    expect(rows[0].attempts).toBe(12)
  })

  it('markResolved frees the subject so a new failure records again', async () => {
    const subjectId = crypto.randomUUID()
    await repo.record(entry({ subjectId }))
    await repo.markResolved('bank_transaction', subjectId)

    expect(await repo.listUnresolved(account.id)).toHaveLength(0)

    // A fresh failure after resolution opens a new live row.
    await repo.record(entry({ subjectId }))
    expect(await repo.listUnresolved(account.id)).toHaveLength(1)

    const { rows } = await getTestPool().query(
      'SELECT resolved_at FROM webhook_dead_letters WHERE subject_id = $1 ORDER BY failed_at',
      [subjectId]
    )
    expect(rows).toHaveLength(2)
    expect(rows.filter(r => r.resolved_at === null)).toHaveLength(1)
  })

  it('listUnresolved scopes by account', async () => {
    const otherUser = await seedUser({ email: `wdl2-${crypto.randomBytes(3).toString('hex')}@test.com` })
    const otherAccount = await seedAccount(otherUser.id)
    await repo.record(entry())
    await repo.record(entry({ accountId: otherAccount.id }))

    expect(await repo.listUnresolved(account.id)).toHaveLength(1)
    expect(await repo.listUnresolved(otherAccount.id)).toHaveLength(1)
    expect(await repo.listUnresolved()).toHaveLength(2)
  })

  it('cascades on account deletion (FK ON DELETE CASCADE)', async () => {
    const e = entry()
    await repo.record(e)
    await getTestPool().query('DELETE FROM accounts WHERE id = $1', [account.id])
    const { rows } = await getTestPool().query(
      'SELECT 1 FROM webhook_dead_letters WHERE subject_id = $1',
      [e.subjectId]
    )
    expect(rows).toHaveLength(0)
  })
})
