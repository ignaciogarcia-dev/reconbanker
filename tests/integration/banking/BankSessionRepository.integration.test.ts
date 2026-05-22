import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { BankSessionRepository } from '../../../src/contexts/banking/infrastructure/BankSessionRepository.js'
import { executorFromPool } from '../../../src/contexts/banking/infrastructure/Executor.js'

describe('BankSessionRepository (integration)', () => {
  let account: SeededAccount
  let repo: BankSessionRepository

  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `bsr-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    repo = new BankSessionRepository(executorFromPool(getTestPool()))
  })
  afterAll(async () => { await closeTestPool() })

  it('marks a session running then stopped with a reason', async () => {
    await repo.markRunning(account.id)
    let { rows } = await getTestPool().query(
      `SELECT status, stop_reason, stopped_at FROM bank_sessions WHERE account_id=$1`, [account.id])
    expect(rows[0].status).toBe('running')
    expect(rows[0].stopped_at).toBeNull()

    await repo.markStopped(account.id, 'logged_out')
    ;({ rows } = await getTestPool().query(
      `SELECT status, stop_reason, stopped_at FROM bank_sessions WHERE account_id=$1`, [account.id]))
    expect(rows[0].status).toBe('stopped')
    expect(rows[0].stop_reason).toBe('logged_out')
    expect(rows[0].stopped_at).not.toBeNull()
  })
})
