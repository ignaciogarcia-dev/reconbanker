import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { insertConciliationRequest, insertBankTransaction, insertAccountConfig } from './helpers.js'
import { executorFromPool } from '../../../src/contexts/conciliation/infrastructure/Executor.js'
import { ConciliationRequestRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliationRequestRepository.js'
import { ConciliatedTransactionRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliatedTransactionRepository.js'
import { AccountConfigReaderAdapter } from '../../../src/contexts/conciliation/infrastructure/adapters/AccountConfigReaderAdapter.js'
import { NotifyWebhookUseCase } from '../../../src/contexts/conciliation/application/NotifyWebhookUseCase.js'
import { WebhookNotificationLogRepository } from '../../../src/shared/infrastructure/webhooks/WebhookNotificationLogRepository.js'

let account: SeededAccount

function buildUseCase(sendWebhookFn: any) {
  const pool = getTestPool()
  return new NotifyWebhookUseCase({
    requestRepo: new ConciliationRequestRepository(executorFromPool(pool)),
    matchRepo: new ConciliatedTransactionRepository(executorFromPool(pool)),
    configReader: new AccountConfigReaderAdapter(pool),
    webhookLog: new WebhookNotificationLogRepository({ query: (text, params) => pool.query(text, params as any) }),
    sendWebhookFn,
  })
}

async function isNotified(matchId: string): Promise<boolean> {
  const { rows } = await getTestPool().query(
    'SELECT is_notified FROM conciliated_transactions WHERE id = $1', [matchId]
  )
  return !!rows[0]?.is_notified
}

describe('NotifyWebhookUseCase (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `nw-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    await insertAccountConfig(account.id)
  })
  afterAll(async () => { await closeTestPool() })

  it('matched: sends, marks notified, and logs a webhook_notifications row', async () => {
    const request = await insertConciliationRequest({ accountId: account.id, status: 'matched' })
    const bankTx = await insertBankTransaction({ accountId: account.id })
    const matchId = crypto.randomUUID()
    await new ConciliatedTransactionRepository(executorFromPool(getTestPool())).save({
      id: matchId, accountId: account.id, requestId: request.id, bankTransactionId: bankTx.id,
    })

    const send = vi.fn().mockResolvedValue({ status: 200, body: '{"received":true}' })
    await buildUseCase(send).execute({ requestId: request.id })

    expect(send).toHaveBeenCalledTimes(1)
    expect(await isNotified(matchId)).toBe(true)

    const { rows } = await getTestPool().query(
      `SELECT subject_type, subject_id, account_id, response_status, error_message, attempt
         FROM webhook_notifications WHERE subject_id = $1`,
      [request.id]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].subject_type).toBe('conciliation_request')
    expect(rows[0].account_id).toBe(account.id)
    expect(rows[0].response_status).toBe(200)
    expect(rows[0].error_message).toBeNull()
    expect(rows[0].attempt).toBe(1)
  })

  it('logs a failure row, does not mark notified, and rethrows', async () => {
    const request = await insertConciliationRequest({ accountId: account.id, status: 'matched' })
    const bankTx = await insertBankTransaction({ accountId: account.id })
    const matchId = crypto.randomUUID()
    await new ConciliatedTransactionRepository(executorFromPool(getTestPool())).save({
      id: matchId, accountId: account.id, requestId: request.id, bankTransactionId: bankTx.id,
    })

    const err = Object.assign(new Error('Webhook failed: 503'), { status: 503, body: 'down' })
    const send = vi.fn().mockRejectedValue(err)

    await expect(buildUseCase(send).execute({ requestId: request.id, attempt: 2 }))
      .rejects.toThrow('Webhook failed: 503')
    expect(await isNotified(matchId)).toBe(false)

    const { rows } = await getTestPool().query(
      `SELECT response_status, response_body, error_message, attempt
         FROM webhook_notifications WHERE subject_id = $1`,
      [request.id]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].response_status).toBe(503)
    expect(rows[0].response_body).toBe('down')
    expect(rows[0].error_message).toBe('Webhook failed: 503')
    expect(rows[0].attempt).toBe(2)
  })
})
