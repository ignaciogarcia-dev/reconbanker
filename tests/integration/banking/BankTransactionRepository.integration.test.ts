import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, getMiDineroBank, SeededAccount } from '../helpers/seed.js'
import { BankTransactionRepository } from '../../../src/contexts/banking/infrastructure/BankTransactionRepository.js'
import { executorFromPool } from '../../../src/contexts/banking/infrastructure/Executor.js'
import { BankTransaction } from '../../../src/contexts/banking/domain/BankTransaction.js'

let account: SeededAccount
let scriptId: string
let repo: BankTransactionRepository

async function getActiveScriptId(): Promise<string> {
  const { rows } = await getTestPool().query(
    `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active' LIMIT 1`
  )
  return rows[0].id
}

function makeTx(overrides: Partial<{ externalId: string; receivedAt: Date; senderName?: string }> = {}): BankTransaction {
  return BankTransaction.create(crypto.randomUUID(), {
    accountId: account.id,
    externalId: overrides.externalId ?? `ext-${crypto.randomBytes(3).toString('hex')}`,
    referenceHash: `ref-${crypto.randomBytes(3).toString('hex')}`,
    amount: 100.5,
    currency: 'USD',
    senderName: overrides.senderName ?? 'Alice',
    receivedAt: overrides.receivedAt ?? new Date(),
    scriptId,
    rawPayload: { source: 'test' },
  })
}

describe('BankTransactionRepository (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `btx-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    scriptId = await getActiveScriptId()
    repo = new BankTransactionRepository(executorFromPool(getTestPool()))
  })
  afterAll(async () => { await closeTestPool() })

  it('save persists a new transaction', async () => {
    const tx = makeTx({ externalId: 'ext-1' })
    await repo.save(tx)
    const { rows } = await getTestPool().query('SELECT * FROM bank_transactions WHERE id=$1', [tx.id])
    expect(rows).toHaveLength(1)
    expect(rows[0].external_id).toBe('ext-1')
    expect(Number(rows[0].amount)).toBe(100.5)
  })

  it('save is idempotent on (account_id, external_id) — ON CONFLICT DO NOTHING', async () => {
    const tx1 = makeTx({ externalId: 'dup' })
    const tx2 = makeTx({ externalId: 'dup' })
    await repo.save(tx1)
    await repo.save(tx2)
    const { rows } = await getTestPool().query(
      'SELECT id FROM bank_transactions WHERE account_id=$1 AND external_id=$2',
      [account.id, 'dup']
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(tx1.id)
  })

  it('findById returns aggregate', async () => {
    const tx = makeTx()
    await repo.save(tx)
    const found = await repo.findById(tx.id)
    expect(found?.id).toBe(tx.id)
    expect(found?.amount).toBe(100.5)
  })

  it('findById returns null when missing', async () => {
    const found = await repo.findById(crypto.randomUUID())
    expect(found).toBeNull()
  })

  it('findById with forUpdate runs without error', async () => {
    const tx = makeTx()
    await repo.save(tx)
    const found = await repo.findById(tx.id, { forUpdate: true })
    expect(found?.id).toBe(tx.id)
  })

  it('findByExternalId returns the transaction', async () => {
    const tx = makeTx({ externalId: 'lookup-me' })
    await repo.save(tx)
    const found = await repo.findByExternalId(account.id, 'lookup-me')
    expect(found?.id).toBe(tx.id)
  })

  it('findLatestExternalId returns the latest by received_at DESC', async () => {
    await repo.save(makeTx({ externalId: 'older', receivedAt: new Date('2024-01-01') }))
    await repo.save(makeTx({ externalId: 'newest', receivedAt: new Date('2024-06-01') }))
    await repo.save(makeTx({ externalId: 'middle', receivedAt: new Date('2024-03-01') }))
    const latest = await repo.findLatestExternalId(account.id)
    expect(latest).toBe('newest')
  })

  it('findLatestExternalId returns null when no transactions', async () => {
    expect(await repo.findLatestExternalId(account.id)).toBeNull()
  })

  it('markExcluded + isExcluded', async () => {
    const tx = makeTx()
    await repo.save(tx)
    expect(await repo.isExcluded(tx.id)).toBe(false)
    await repo.markExcluded(tx.id)
    expect(await repo.isExcluded(tx.id)).toBe(true)
  })

  it('markNotified + isNotified', async () => {
    const tx = makeTx()
    await repo.save(tx)
    expect(await repo.isNotified(tx.id)).toBe(false)
    await repo.markNotified(tx.id)
    expect(await repo.isNotified(tx.id)).toBe(true)
  })

  it('markAllNotified sets notified_at for all pending in account', async () => {
    const a = makeTx({ externalId: 'a' })
    const b = makeTx({ externalId: 'b' })
    await repo.save(a)
    await repo.save(b)
    await repo.markAllNotified(account.id)
    expect(await repo.isNotified(a.id)).toBe(true)
    expect(await repo.isNotified(b.id)).toBe(true)
  })

  describe('claimNotification (CAS)', () => {
    it('returns true on first call, false on subsequent', async () => {
      const tx = makeTx()
      await repo.save(tx)
      expect(await repo.claimNotification(tx.id)).toBe(true)
      expect(await repo.claimNotification(tx.id)).toBe(false)
    })

    it('only one of two concurrent claims wins', async () => {
      const tx = makeTx()
      await repo.save(tx)
      const [a, b] = await Promise.all([
        repo.claimNotification(tx.id),
        repo.claimNotification(tx.id),
      ])
      expect([a, b].filter(Boolean)).toHaveLength(1)
      expect([a, b].filter((v) => !v)).toHaveLength(1)
    })

    it('releaseNotification allows re-claim', async () => {
      const tx = makeTx()
      await repo.save(tx)
      expect(await repo.claimNotification(tx.id)).toBe(true)
      await repo.releaseNotification(tx.id)
      expect(await repo.isNotified(tx.id)).toBe(false)
      expect(await repo.claimNotification(tx.id)).toBe(true)
    })
  })

  it('withTx returns a repo bound to the given executor', async () => {
    const client = await getTestPool().connect()
    try {
      await client.query('BEGIN')
      const txRepo = repo.withTx({ query: (text, params) => client.query(text, params as any) })
      const tx = makeTx({ externalId: 'in-tx' })
      await txRepo.save(tx)
      // visible inside the transaction
      const insideTx = await txRepo.findById(tx.id)
      expect(insideTx?.id).toBe(tx.id)
      // not yet visible outside
      const outsideBefore = await repo.findById(tx.id)
      expect(outsideBefore).toBeNull()
      await client.query('COMMIT')
      const outsideAfter = await repo.findById(tx.id)
      expect(outsideAfter?.id).toBe(tx.id)
    } finally {
      client.release()
    }
  })
})
