import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { executorFromPool } from '../../../src/contexts/conciliation/infrastructure/Executor.js'
import { ConciliationAttemptRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliationAttemptRepository.js'
import { insertConciliationRequest, insertBankTransaction } from './helpers.js'

describe('ConciliationAttemptRepository (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  function buildRepo() {
    return new ConciliationAttemptRepository(executorFromPool(getTestPool()))
  }

  it('save persists an attempt with candidateIds as JSONB', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const req = await insertConciliationRequest({ accountId: acc.id })
    const btx1 = await insertBankTransaction({ accountId: acc.id, externalId: 'btx-a' })
    const btx2 = await insertBankTransaction({ accountId: acc.id, externalId: 'btx-b' })

    const id = crypto.randomUUID()
    await buildRepo().save({
      id,
      accountId: acc.id,
      requestId: req.id,
      attemptNumber: 1,
      status: 'success',
      candidateIds: [btx1.id, btx2.id],
      selectedTransactionId: btx1.id,
    })

    const { rows } = await getTestPool().query(
      `SELECT id, request_id, attempt_number, status, matched_candidates, selected_transaction_id
         FROM conciliation_attempts WHERE id = $1`,
      [id]
    )
    expect(rows[0].request_id).toBe(req.id)
    expect(rows[0].attempt_number).toBe(1)
    expect(rows[0].status).toBe('success')
    expect(rows[0].selected_transaction_id).toBe(btx1.id)
    const candidates = typeof rows[0].matched_candidates === 'string'
      ? JSON.parse(rows[0].matched_candidates)
      : rows[0].matched_candidates
    expect(candidates).toEqual([btx1.id, btx2.id])
  })

  it('save accepts a failed attempt with failure_type and no selected transaction', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const req = await insertConciliationRequest({ accountId: acc.id })

    const id = crypto.randomUUID()
    await buildRepo().save({
      id,
      accountId: acc.id,
      requestId: req.id,
      attemptNumber: 1,
      status: 'no_match',
      failureType: 'rule_miss',
      candidateIds: [],
    })

    const { rows } = await getTestPool().query(
      `SELECT status, failure_type, selected_transaction_id, matched_candidates
         FROM conciliation_attempts WHERE id = $1`, [id]
    )
    expect(rows[0].status).toBe('no_match')
    expect(rows[0].failure_type).toBe('rule_miss')
    expect(rows[0].selected_transaction_id).toBeNull()
  })
})
