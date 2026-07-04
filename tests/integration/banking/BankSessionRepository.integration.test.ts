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

  it('parks a session in needs_attention with the reason', async () => {
    await repo.markRunning(account.id)
    await repo.markNeedsAttention(account.id, 'auth_timeout')
    const { rows } = await getTestPool().query(
      `SELECT status, stop_reason FROM bank_sessions WHERE account_id=$1`, [account.id])
    expect(rows[0].status).toBe('needs_attention')
    expect(rows[0].stop_reason).toBe('auth_timeout')
  })

  it('resets every running session to stopped and returns the count', async () => {
    await repo.markRunning(account.id)

    const count = await repo.markAllRunningStopped('process_restart')

    expect(count).toBe(1)
    const { rows } = await getTestPool().query(
      `SELECT status, stop_reason FROM bank_sessions WHERE account_id=$1`, [account.id])
    expect(rows[0].status).toBe('stopped')
    expect(rows[0].stop_reason).toBe('process_restart')
  })

  it('markRunning returns the previous status: null on first insert, prior status thereafter', async () => {
    // First call inserts the row — there is no previous status.
    expect(await repo.markRunning(account.id)).toBeNull()

    // Park the session, then reactivate: markRunning reports the pre-update status, proving the CTE
    // snapshot reads the row before the upsert overwrites it to 'running'.
    await repo.markNeedsAttention(account.id, 'auth_timeout')
    expect(await repo.markRunning(account.id)).toBe('needs_attention')
  })
})
