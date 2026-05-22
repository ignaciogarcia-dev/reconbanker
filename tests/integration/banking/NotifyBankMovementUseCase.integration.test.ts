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
import { BankTransaction } from '../../../src/contexts/banking/domain/BankTransaction.js'

let user: SeededUser
let account: SeededAccount
let scriptId: string
let txRepo: BankTransactionRepository
let configRepo: AccountConfigRepository
let userRepo: UserRepository

async function getActiveScriptId(): Promise<string> {
  const { rows } = await getTestPool().query(
    `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active' LIMIT 1`
  )
  return rows[0].id
}

async function seedAccountConfig(opts: {
  webhookUrl?: string | null
  silentIngestion?: boolean
} = {}): Promise<void> {
  // Need to insert directly because the AccountConfigRepository.upsert requires
  // webhook_url NOT NULL. To test "no webhook" we set empty string and have the
  // adapter pass that through — but the use case checks for falsy URL.
  // Easier: insert directly with raw SQL when nullability is needed.
  await getTestPool().query(
    `INSERT INTO account_config
      (id, account_id, pending_orders_endpoint, webhook_url, retry_limit,
       polling_method, polling_body, auth_type, auth_token,
       webhook_auth_type, webhook_auth_token, notify_on_expired,
       webhook_extra_fields, silent_ingestion)
     VALUES (gen_random_uuid(),$1,$2,$3,3,'GET',NULL,'bearer','tok',NULL,NULL,false,$4,$5)`,
    [
      account.id,
      'https://orders.example/pending',
      opts.webhookUrl === undefined ? 'https://hook.example.com' : (opts.webhookUrl ?? ''),
      JSON.stringify({ source: 'bank' }),
      opts.silentIngestion ?? false,
    ]
  )
}

async function seedBankTx(opts: { senderName?: string | null } = {}): Promise<BankTransaction> {
  const tx = BankTransaction.create(crypto.randomUUID(), {
    accountId: account.id,
    externalId: `ext-${crypto.randomBytes(3).toString('hex')}`,
    referenceHash: 'ref',
    amount: 250,
    currency: 'USD',
    senderName: opts.senderName === undefined ? 'Alice' : (opts.senderName ?? undefined),
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
    sendWebhookFn,
  })
}

describe('NotifyBankMovementUseCase (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    const pool = getTestPool()
    user = await seedUser({ email: `nbm-${crypto.randomBytes(3).toString('hex')}@test.com`, operationMode: 'passthrough' })
    account = await seedAccount(user.id)
    scriptId = await getActiveScriptId()
    txRepo = new BankTransactionRepository(bankingExec(pool))
    configRepo = new AccountConfigRepository(accountExec(pool))
    userRepo = new UserRepository(userExec(pool))
  })
  afterAll(async () => { await closeTestPool() })

  it('happy path: claims notification and invokes send with correct payload', async () => {
    await seedAccountConfig()
    const tx = await seedBankTx()
    const send = vi.fn().mockResolvedValue(undefined)
    const useCase = buildUseCase(send)
    await useCase.execute({ bankTransactionId: tx.id })

    expect(send).toHaveBeenCalledTimes(1)
    const call = send.mock.calls[0][0]
    expect(call.url).toBe('https://hook.example.com')
    expect(call.payload.id).toBe(tx.id)
    expect(call.payload.amount).toBe(250)
    expect(call.payload.currency).toBe('USD')
    expect(call.payload.name).toBe('Alice')
    expect(call.payload.received_at).toBe(new Date('2024-05-01T10:00:00Z').toISOString())
    expect(call.payload.source).toBe('bank')
    expect(await txRepo.isNotified(tx.id)).toBe(true)
  })

  it('silentIngestion=true claims but does not send', async () => {
    await seedAccountConfig({ silentIngestion: true })
    const tx = await seedBankTx()
    const send = vi.fn().mockResolvedValue(undefined)
    await buildUseCase(send).execute({ bankTransactionId: tx.id })
    expect(send).not.toHaveBeenCalled()
    expect(await txRepo.isNotified(tx.id)).toBe(true)
  })

  it('mode=reconcile: does nothing (no claim, no send)', async () => {
    await userRepo.setOperationMode(user.id, 'reconcile')
    await seedAccountConfig()
    const tx = await seedBankTx()
    const send = vi.fn().mockResolvedValue(undefined)
    await buildUseCase(send).execute({ bankTransactionId: tx.id })
    expect(send).not.toHaveBeenCalled()
    expect(await txRepo.isNotified(tx.id)).toBe(false)
  })

  it('no webhook url: does nothing', async () => {
    await seedAccountConfig({ webhookUrl: '' })
    const tx = await seedBankTx()
    const send = vi.fn().mockResolvedValue(undefined)
    await buildUseCase(send).execute({ bankTransactionId: tx.id })
    expect(send).not.toHaveBeenCalled()
    expect(await txRepo.isNotified(tx.id)).toBe(false)
  })

  it('no senderName: does nothing', async () => {
    await seedAccountConfig()
    const tx = await seedBankTx({ senderName: null })
    const send = vi.fn().mockResolvedValue(undefined)
    await buildUseCase(send).execute({ bankTransactionId: tx.id })
    expect(send).not.toHaveBeenCalled()
    expect(await txRepo.isNotified(tx.id)).toBe(false)
  })

  it('send failure releases the claim (notified_at back to NULL) and rethrows', async () => {
    await seedAccountConfig()
    const tx = await seedBankTx()
    const send = vi.fn().mockRejectedValue(new Error('5xx'))
    const useCase = buildUseCase(send)
    await expect(useCase.execute({ bankTransactionId: tx.id })).rejects.toThrow('5xx')
    expect(await txRepo.isNotified(tx.id)).toBe(false)
  })

  it('second invocation with the same tx does not double-send (claim already taken)', async () => {
    await seedAccountConfig()
    const tx = await seedBankTx()
    const send = vi.fn().mockResolvedValue(undefined)
    const useCase = buildUseCase(send)
    await useCase.execute({ bankTransactionId: tx.id })
    await useCase.execute({ bankTransactionId: tx.id })
    expect(send).toHaveBeenCalledTimes(1)
  })
})
