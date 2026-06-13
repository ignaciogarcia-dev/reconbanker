import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { executorFromPool } from '../../../src/contexts/conciliation/infrastructure/Executor.js'
import { ConciliationRequestRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliationRequestRepository.js'
import { ConciliationRequest } from '../../../src/contexts/conciliation/domain/ConciliationRequest.js'

describe('poll idempotency — createIfAbsent (A3)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('two concurrent inserts of the same (account, external_id) yield exactly one row without crashing', async () => {
    const user = await seedUser({})
    const account = await seedAccount(user.id)
    const repo = new ConciliationRequestRepository(executorFromPool(getTestPool()))

    const makeReq = () =>
      ConciliationRequest.create(crypto.randomUUID(), {
        accountId: account.id,
        externalId: 'order-42',
        expectedAmount: 100,
        currency: 'USD',
        senderName: 'Alice',
      })

    const results = await Promise.all([repo.createIfAbsent(makeReq()), repo.createIfAbsent(makeReq())])

    // Exactly one insert wins; the other is a no-op, not a unique-violation crash.
    expect(results.filter(Boolean)).toHaveLength(1)
    const { rows } = await getTestPool().query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM conciliation_requests WHERE account_id = $1 AND external_id = 'order-42'`,
      [account.id]
    )
    expect(rows[0].n).toBe(1)
  })
})
