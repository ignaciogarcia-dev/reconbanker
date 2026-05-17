import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { ConciliationReadModel } from '../../../src/contexts/conciliation/infrastructure/ConciliationReadModel.js'
import { insertConciliationRequest, insertBankTransaction } from './helpers.js'

describe('ConciliationReadModel (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  function buildRm() {
    return new ConciliationReadModel(getTestPool())
  }

  it('list returns only the user\'s requests', async () => {
    const owner = await seedUser()
    const stranger = await seedUser()
    const accOwner = await seedAccount(owner.id)
    const accStranger = await seedAccount(stranger.id)
    await insertConciliationRequest({ accountId: accOwner.id, externalId: 'mine' })
    await insertConciliationRequest({ accountId: accStranger.id, externalId: 'theirs' })

    const items = await buildRm().list({ userId: owner.id, limit: 10, offset: 0 })
    expect(items).toHaveLength(1)
    expect(items[0].externalId).toBe('mine')
    expect(items[0].bank).toBe('mi-dinero')
    expect(items[0].accountName).toBe(accOwner.name)
  })

  it('list filters by status', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    await insertConciliationRequest({ accountId: acc.id, externalId: 'p', status: 'pending' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'm', status: 'matched' })

    const items = await buildRm().list({ userId: user.id, limit: 10, offset: 0, status: 'matched' })
    expect(items).toHaveLength(1)
    expect(items[0].externalId).toBe('m')
  })

  it('list honors limit and offset, ordered by created_at DESC', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    await insertConciliationRequest({ accountId: acc.id, externalId: 'first', createdAt: new Date(Date.now() - 2000) })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'second', createdAt: new Date(Date.now() - 1000) })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'third', createdAt: new Date() })

    const rm = buildRm()
    const page1 = await rm.list({ userId: user.id, limit: 2, offset: 0 })
    expect(page1.map(i => i.externalId)).toEqual(['third', 'second'])

    const page2 = await rm.list({ userId: user.id, limit: 2, offset: 2 })
    expect(page2.map(i => i.externalId)).toEqual(['first'])
  })

  it('findDetailForUser returns request with attempts and primary match', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const req = await insertConciliationRequest({ accountId: acc.id })
    const btx = await insertBankTransaction({ accountId: acc.id, amount: 123.45 })

    const attemptId = crypto.randomUUID()
    await getTestPool().query(
      `INSERT INTO conciliation_attempts
        (id, account_id, request_id, attempt_number, status, matched_candidates, selected_transaction_id)
       VALUES ($1,$2,$3,1,'success',$4::jsonb,$5)`,
      [attemptId, acc.id, req.id, JSON.stringify([btx.id]), btx.id]
    )
    const matchId = crypto.randomUUID()
    await getTestPool().query(
      `INSERT INTO conciliated_transactions
        (id, account_id, request_id, bank_transaction_id, matched_by, is_primary, is_notified)
       VALUES ($1,$2,$3,$4,'engine',true,false)`,
      [matchId, acc.id, req.id, btx.id]
    )

    const detail = await buildRm().findDetailForUser(req.id, user.id)
    expect(detail).not.toBeNull()
    expect(detail!.id).toBe(req.id)
    expect(detail!.attempts).toHaveLength(1)
    expect(detail!.attempts[0].id).toBe(attemptId)
    expect(detail!.attempts[0].candidateIds).toEqual([btx.id])
    expect(detail!.attempts[0].selectedTransactionId).toBe(btx.id)
    expect(detail!.match).not.toBeNull()
    expect(detail!.match!.id).toBe(matchId)
    expect(detail!.match!.bankTransactionId).toBe(btx.id)
    expect(detail!.match!.amount).toBe(123.45)
  })

  it('findDetailForUser returns a detail with empty attempts and null match when none exist (LEFT JOIN)', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const req = await insertConciliationRequest({ accountId: acc.id })

    const detail = await buildRm().findDetailForUser(req.id, user.id)
    expect(detail).not.toBeNull()
    expect(detail!.attempts).toEqual([])
    expect(detail!.match).toBeNull()
  })

  it('findDetailForUser returns null when user does not own the request', async () => {
    const owner = await seedUser()
    const stranger = await seedUser()
    const acc = await seedAccount(owner.id)
    const req = await insertConciliationRequest({ accountId: acc.id })

    const detail = await buildRm().findDetailForUser(req.id, stranger.id)
    expect(detail).toBeNull()
  })
})
