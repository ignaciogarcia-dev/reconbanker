import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount, SeededUser } from '../helpers/seed.js'
import { BankTransactionRepository } from '../../../src/contexts/banking/infrastructure/BankTransactionRepository.js'
import { executorFromPool as bankingExec } from '../../../src/contexts/banking/infrastructure/Executor.js'
import { executorFromPool as accountExec } from '../../../src/contexts/account/infrastructure/Executor.js'
import { executorFromPool as userExec } from '../../../src/contexts/user/infrastructure/Executor.js'
import { AccountRepository } from '../../../src/contexts/account/infrastructure/AccountRepository.js'
import { AccountConfigRepository } from '../../../src/contexts/account/infrastructure/AccountConfigRepository.js'
import { UserRepository } from '../../../src/contexts/user/infrastructure/UserRepository.js'
import { AccountForBankingReaderAdapter } from '../../../src/contexts/banking/infrastructure/adapters/AccountForBankingReaderAdapter.js'
import { NotificationConfigReaderAdapter } from '../../../src/contexts/banking/infrastructure/adapters/NotificationConfigReaderAdapter.js'
import { UserOperationModeReaderAdapter } from '../../../src/contexts/banking/infrastructure/adapters/UserOperationModeReaderAdapter.js'
import { NotifyBankMovementUseCase } from '../../../src/contexts/banking/application/NotifyBankMovementUseCase.js'
import { WebhookNotificationLogRepository } from '../../../src/shared/infrastructure/webhooks/WebhookNotificationLogRepository.js'
import { WebhookDeadLetterRepository } from '../../../src/shared/infrastructure/webhooks/WebhookDeadLetterRepository.js'
import { BankTransaction } from '../../../src/contexts/banking/domain/BankTransaction.js'

let user: SeededUser
let account: SeededAccount
let scriptId: string
let txRepo: BankTransactionRepository
let deadLetters: WebhookDeadLetterRepository

async function getActiveScriptId(): Promise<string> {
  const { rows } = await getTestPool().query(
    `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active' LIMIT 1`
  )
  return rows[0].id
}

async function seedAccountConfig(): Promise<void> {
  await getTestPool().query(
    `INSERT INTO account_config
      (id, account_id, pending_orders_endpoint, webhook_url, retry_limit,
       polling_method, polling_body, auth_type, auth_token,
       webhook_auth_type, webhook_auth_token, notify_on_expired,
       webhook_extra_fields, silent_ingestion)
     VALUES (gen_random_uuid(),$1,$2,$3,3,'GET',NULL,'bearer','tok',NULL,NULL,false,NULL,false)`,
    [account.id, 'https://orders.example/pending', 'https://hook.example.com']
  )
}

async function seedBankTx(): Promise<BankTransaction> {
  const tx = BankTransaction.create(crypto.randomUUID(), {
    accountId: account.id,
    externalId: `ext-${crypto.randomBytes(3).toString('hex')}`,
    referenceHash: 'ref',
    amount: 250,
    currency: 'USD',
    senderName: 'Alice',
    receivedAt: new Date('2024-05-01T10:00:00Z'),
    scriptId,
    rawPayload: { foo: 'bar' },
  })
  await txRepo.save(tx)
  return tx
}

function buildUseCase(sendWebhookFn: any) {
  const pool = getTestPool()
  return new NotifyBankMovementUseCase({
    bankTxRepo: txRepo,
    accountReader: new AccountForBankingReaderAdapter(new AccountRepository(accountExec(pool)), new AccountConfigRepository(accountExec(pool))),
    configReader: new NotificationConfigReaderAdapter(new AccountConfigRepository(accountExec(pool))),
    userModeReader: new UserOperationModeReaderAdapter(new UserRepository(userExec(pool))),
    webhookLog: new WebhookNotificationLogRepository({ query: (text, params) => pool.query(text, params as any) }),
    sendWebhookFn,
  })
}

/** Mirrors the worker's final-failure handler: dead-letter the exhausted subject. */
async function deadLetterFinalFailure(tx: BankTransaction, err: Error, attempts: number): Promise<void> {
  const status = (err as { status?: unknown }).status
  await deadLetters.record({
    accountId: tx.accountId,
    subjectType: 'bank_transaction',
    subjectId: tx.id,
    url: null,
    lastStatus: typeof status === 'number' ? status : null,
    lastError: err.message,
    attempts,
  })
}

describe('Webhook retry + dead-letter (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    const pool = getTestPool()
    user = await seedUser({ email: `wrdl-${crypto.randomBytes(3).toString('hex')}@test.com`, operationMode: 'passthrough' })
    account = await seedAccount(user.id)
    scriptId = await getActiveScriptId()
    txRepo = new BankTransactionRepository(bankingExec(pool))
    deadLetters = new WebhookDeadLetterRepository({ query: (text, params) => pool.query(text, params as any) })
    await seedAccountConfig()
  })
  afterAll(async () => { await closeTestPool() })

  it('records every attempt, dead-letters on exhaustion, and resolves on re-drive', async () => {
    const tx = await seedBankTx()

    // Three failing attempts: 401, 500, then a transport error with no HTTP status.
    const attemptErrors = [
      Object.assign(new Error('Webhook failed: 401'), { status: 401, body: 'bad token' }),
      Object.assign(new Error('Webhook failed: 500'), { status: 500, body: 'oops' }),
      new Error('The operation was aborted due to timeout'),
    ]
    for (let attempt = 1; attempt <= 3; attempt++) {
      const send = vi.fn().mockRejectedValue(attemptErrors[attempt - 1])
      await expect(buildUseCase(send).execute({ bankTransactionId: tx.id, attempt }))
        .rejects.toThrow(attemptErrors[attempt - 1].message)
    }

    // (a) one audit row per attempt, 1-based, with the right status/body.
    const audit = await getTestPool().query(
      `SELECT attempt, response_status, response_body, error_message
         FROM webhook_notifications WHERE subject_id = $1 ORDER BY attempt`,
      [tx.id]
    )
    expect(audit.rows.map(r => r.attempt)).toEqual([1, 2, 3])
    expect(audit.rows.map(r => r.response_status)).toEqual([401, 500, null])
    expect(audit.rows[0].response_body).toBe('bad token')
    expect(audit.rows[2].response_body).toBeNull()

    // (b) after the final failure the worker dead-letters the subject.
    await deadLetterFinalFailure(tx, attemptErrors[2], 3)
    const dl = await deadLetters.listUnresolved(account.id)
    expect(dl).toHaveLength(1)
    expect(dl[0]).toMatchObject({ subjectId: tx.id, lastStatus: null, attempts: 3, resolvedAt: null })
    expect(dl[0].lastError).toBe('The operation was aborted due to timeout')
    // The movement is released — without the dead-letter it would be
    // indistinguishable from one never attempted.
    expect(await txRepo.isNotified(tx.id)).toBe(false)

    // (c) re-drive: the endpoint is back, delivery succeeds, dead-letter resolves.
    const okSend = vi.fn().mockResolvedValue({ status: 200, body: '{"ok":true}' })
    await buildUseCase(okSend).execute({ bankTransactionId: tx.id, attempt: 4 })
    await deadLetters.markResolved('bank_transaction', tx.id) // worker's `completed` handler

    expect(await txRepo.isNotified(tx.id)).toBe(true)
    expect(await deadLetters.listUnresolved(account.id)).toHaveLength(0)
    const success = await getTestPool().query(
      `SELECT response_status FROM webhook_notifications WHERE subject_id = $1 AND attempt = 4`,
      [tx.id]
    )
    expect(success.rows[0].response_status).toBe(200)
  })
})
