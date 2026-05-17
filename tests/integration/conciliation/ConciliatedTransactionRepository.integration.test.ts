import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { executorFromPool } from '../../../src/contexts/conciliation/infrastructure/Executor.js'
import { ConciliatedTransactionRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliatedTransactionRepository.js'
import { insertConciliationRequest, insertBankTransaction } from './helpers.js'

describe('ConciliatedTransactionRepository (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  function buildRepo() {
    return new ConciliatedTransactionRepository(executorFromPool(getTestPool()))
  }

  it('save persists a primary match and findPrimaryByRequest finds it', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const req = await insertConciliationRequest({ accountId: acc.id })
    const btx = await insertBankTransaction({ accountId: acc.id })
    const repo = buildRepo()
    const matchId = crypto.randomUUID()

    await repo.save({
      id: matchId,
      accountId: acc.id,
      requestId: req.id,
      bankTransactionId: btx.id,
    })

    const found = await repo.findPrimaryByRequest(req.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(matchId)

    const { rows } = await getTestPool().query(
      `SELECT matched_by, is_primary, is_notified FROM conciliated_transactions WHERE id = $1`,
      [matchId]
    )
    expect(rows[0].matched_by).toBe('engine')
    expect(rows[0].is_primary).toBe(true)
    expect(rows[0].is_notified).toBe(false)
  })

  it('findPrimaryByRequest returns null when no match exists', async () => {
    const found = await buildRepo().findPrimaryByRequest(crypto.randomUUID())
    expect(found).toBeNull()
  })

  it('markNotified flips is_notified to true', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const req = await insertConciliationRequest({ accountId: acc.id })
    const btx = await insertBankTransaction({ accountId: acc.id })
    const repo = buildRepo()
    const matchId = crypto.randomUUID()
    await repo.save({ id: matchId, accountId: acc.id, requestId: req.id, bankTransactionId: btx.id })

    await repo.markNotified(matchId)

    const { rows } = await getTestPool().query(
      `SELECT is_notified FROM conciliated_transactions WHERE id = $1`, [matchId]
    )
    expect(rows[0].is_notified).toBe(true)
  })
})
