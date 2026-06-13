import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { AssistanceRequestRepository } from '../../../src/contexts/banking/infrastructure/AssistanceRequestRepository.js'
import { executorFromPool } from '../../../src/contexts/banking/infrastructure/Executor.js'

const DESCRIPTOR = { length: 6, type: 'numeric' as const }
const SESSION_ID = '5f3d2a1b-0000-4000-8000-000000000001'

describe('AssistanceRequestRepository (integration)', () => {
  let account: SeededAccount
  let repo: AssistanceRequestRepository

  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `arr-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    repo = new AssistanceRequestRepository(executorFromPool(getTestPool()))
  })
  afterAll(async () => { await closeTestPool() })

  it('opens a pending request and re-opens it on a resend instead of duplicating', async () => {
    const first = await repo.open(account.id, DESCRIPTOR, SESSION_ID)
    expect(first.status).toBe('pending')
    expect(first.attempts).toBe(1)
    expect(first.sessionId).toBe(SESSION_ID)
    expect(first.descriptor).toEqual(DESCRIPTOR)

    const second = await repo.open(account.id, { length: 8, type: 'alphanumeric' }, null)
    expect(second.id).toBe(first.id)
    expect(second.attempts).toBe(2)
    expect(second.sessionId).toBe(SESSION_ID) // COALESCE keeps the original session
    expect(second.descriptor).toEqual({ length: 8, type: 'alphanumeric' })

    const { rows } = await getTestPool().query(
      `SELECT count(*)::int AS n FROM assistance_requests WHERE account_id = $1`, [account.id])
    expect(rows[0].n).toBe(1)
  })

  it('finds the pending request and stops finding it once fulfilled', async () => {
    const opened = await repo.open(account.id, DESCRIPTOR)
    const found = await repo.findPending(account.id)
    expect(found?.id).toBe(opened.id)

    await repo.markFulfilled(opened.id)
    expect(await repo.findPending(account.id)).toBeNull()

    const { rows } = await getTestPool().query(
      `SELECT status, fulfilled_at FROM assistance_requests WHERE id = $1`, [opened.id])
    expect(rows[0].status).toBe('fulfilled')
    expect(rows[0].fulfilled_at).not.toBeNull()
  })

  it('returns null when there is no pending request', async () => {
    expect(await repo.findPending(account.id)).toBeNull()
  })

  it('closes a pending request as cancelled or expired', async () => {
    const opened = await repo.open(account.id, DESCRIPTOR)
    await repo.close(opened.id, 'cancelled')

    const { rows } = await getTestPool().query(
      `SELECT status FROM assistance_requests WHERE id = $1`, [opened.id])
    expect(rows[0].status).toBe('cancelled')
    expect(await repo.findPending(account.id)).toBeNull()
  })

  it('exposes withTx returning a repository bound to the given executor', () => {
    const tx = repo.withTx(executorFromPool(getTestPool()))
    expect(tx).toBeInstanceOf(AssistanceRequestRepository)
  })
})
