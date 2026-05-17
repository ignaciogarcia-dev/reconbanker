import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { BankMovementReadModel } from '../../../src/contexts/banking/infrastructure/BankMovementReadModel.js'
import { BankTransactionRepository } from '../../../src/contexts/banking/infrastructure/BankTransactionRepository.js'
import { executorFromPool } from '../../../src/contexts/banking/infrastructure/Executor.js'
import { BankTransaction } from '../../../src/contexts/banking/domain/BankTransaction.js'

let account: SeededAccount
let otherAccount: SeededAccount
let scriptId: string
let txRepo: BankTransactionRepository
let readModel: BankMovementReadModel

async function getActiveScriptId(): Promise<string> {
  const { rows } = await getTestPool().query(
    `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active' LIMIT 1`
  )
  return rows[0].id
}

async function seedTx(accId: string, externalId: string, receivedAt: Date, senderName: string | null = 'Alice'): Promise<string> {
  const tx = BankTransaction.create(crypto.randomUUID(), {
    accountId: accId,
    externalId,
    referenceHash: `ref-${externalId}`,
    amount: 50,
    currency: 'USD',
    senderName: senderName ?? undefined,
    receivedAt,
    scriptId,
    rawPayload: {},
  })
  await txRepo.save(tx)
  return tx.id
}

describe('BankMovementReadModel (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `rm-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id, { name: 'a' })
    otherAccount = await seedAccount(user.id, { name: 'b' })
    scriptId = await getActiveScriptId()
    txRepo = new BankTransactionRepository(executorFromPool(getTestPool()))
    readModel = new BankMovementReadModel(getTestPool())
  })
  afterAll(async () => { await closeTestPool() })

  it('list returns camelCase DTOs', async () => {
    await seedTx(account.id, 'e1', new Date('2024-01-01'), 'Alice')
    const rows = await readModel.list({ accountId: account.id, limit: 10, offset: 0 })
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.externalId).toBe('e1')
    expect(r.senderName).toBe('Alice')
    expect(r.receivedAt).toBeInstanceOf(Date)
    expect(r.notifiedAt).toBeNull()
    expect(r.excludedAt).toBeNull()
    expect(typeof r.amount).toBe('number')
    expect(r.amount).toBe(50)
  })

  it('list orders by received_at DESC', async () => {
    await seedTx(account.id, 'old', new Date('2024-01-01'))
    await seedTx(account.id, 'new', new Date('2024-06-01'))
    await seedTx(account.id, 'mid', new Date('2024-03-01'))
    const rows = await readModel.list({ accountId: account.id, limit: 10, offset: 0 })
    expect(rows.map((r) => r.externalId)).toEqual(['new', 'mid', 'old'])
  })

  it('list applies limit and offset', async () => {
    await seedTx(account.id, 'e1', new Date('2024-01-01'))
    await seedTx(account.id, 'e2', new Date('2024-02-01'))
    await seedTx(account.id, 'e3', new Date('2024-03-01'))
    const page1 = await readModel.list({ accountId: account.id, limit: 2, offset: 0 })
    const page2 = await readModel.list({ accountId: account.id, limit: 2, offset: 2 })
    expect(page1.map((r) => r.externalId)).toEqual(['e3', 'e2'])
    expect(page2.map((r) => r.externalId)).toEqual(['e1'])
  })

  it('list filters by accountId', async () => {
    await seedTx(account.id, 'mine', new Date('2024-01-01'))
    await seedTx(otherAccount.id, 'theirs', new Date('2024-02-01'))
    const rows = await readModel.list({ accountId: account.id, limit: 10, offset: 0 })
    expect(rows).toHaveLength(1)
    expect(rows[0].externalId).toBe('mine')
  })
})
