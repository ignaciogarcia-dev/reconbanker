import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { executorFromPool } from '../../../src/contexts/conciliation/infrastructure/Executor.js'
import { ConciliationRequestRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliationRequestRepository.js'
import { ConciliationRequest } from '../../../src/contexts/conciliation/domain/ConciliationRequest.js'
import { insertConciliationRequest } from './helpers.js'

describe('ConciliationRequestRepository (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  function buildRepo() {
    return new ConciliationRequestRepository(executorFromPool(getTestPool()))
  }

  it('save + findById round trips an aggregate', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const repo = buildRepo()
    const id = crypto.randomUUID()
    const req = ConciliationRequest.create(id, {
      accountId: acc.id, externalId: 'ext-1',
      expectedAmount: 250.5, currency: 'USD', senderName: 'Alice',
    })
    await repo.save(req)

    const found = await repo.findById(id)
    expect(found).not.toBeNull()
    expect(found!.accountId).toBe(acc.id)
    expect(found!.externalId).toBe('ext-1')
    expect(found!.expectedAmount).toBe(250.5)
    expect(found!.currency).toBe('USD')
    expect(found!.senderName).toBe('Alice')
    expect(found!.status).toBe('pending')
  })

  it('findById returns null for unknown id', async () => {
    const repo = buildRepo()
    expect(await repo.findById(crypto.randomUUID())).toBeNull()
  })

  it('findByIdForUpdate runs without error (FOR UPDATE SKIP LOCKED)', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const seeded = await insertConciliationRequest({ accountId: acc.id })
    const repo = buildRepo()
    const found = await repo.findByIdForUpdate(seeded.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(seeded.id)
  })

  it('findActiveExternalIds returns a Set excluding cancelled and expired', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    await insertConciliationRequest({ accountId: acc.id, externalId: 'a-pending', status: 'pending' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'a-matched', status: 'matched' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'a-not-found', status: 'not_found' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'a-cancelled', status: 'cancelled' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'a-expired', status: 'expired' })

    const result = await buildRepo().findActiveExternalIds(acc.id)
    expect(result).toBeInstanceOf(Set)
    expect(result.has('a-pending')).toBe(true)
    expect(result.has('a-matched')).toBe(true)
    expect(result.has('a-not-found')).toBe(true)
    expect(result.has('a-cancelled')).toBe(false)
    expect(result.has('a-expired')).toBe(false)
  })

  it('findPendingByAccount returns pending + not_found ordered by created_at', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const older = new Date(Date.now() - 60_000)
    const newer = new Date()
    await insertConciliationRequest({ accountId: acc.id, externalId: 'p1', status: 'pending', createdAt: newer })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'nf', status: 'not_found', createdAt: older })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'm', status: 'matched' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'c', status: 'cancelled' })

    const list = await buildRepo().findPendingByAccount(acc.id)
    expect(list).toHaveLength(2)
    expect(list[0].externalId).toBe('nf')
    expect(list[1].externalId).toBe('p1')
  })

  it('findStale returns only requests older than cutoff', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const old = await insertConciliationRequest({
      accountId: acc.id, externalId: 'old',
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    })
    await insertConciliationRequest({
      accountId: acc.id, externalId: 'fresh',
      createdAt: new Date(),
    })

    const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const stale = await buildRepo().findStale(cutoff)
    expect(stale).toHaveLength(1)
    expect(stale[0].id).toBe(old.id)
    expect(stale[0].accountId).toBe(acc.id)
  })

  it('hasActiveRequests returns true with pending and false with all terminal', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const repo = buildRepo()
    expect(await repo.hasActiveRequests(acc.id)).toBe(false)
    await insertConciliationRequest({ accountId: acc.id, status: 'pending' })
    expect(await repo.hasActiveRequests(acc.id)).toBe(true)
  })

  it('cancelMissing cancels rows whose external_id is not in the present list', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    await insertConciliationRequest({ accountId: acc.id, externalId: 'keep-1', status: 'pending' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'gone-1', status: 'pending' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'gone-2', status: 'not_found' })
    await insertConciliationRequest({ accountId: acc.id, externalId: 'terminal', status: 'matched' })

    const cancelled = await buildRepo().cancelMissing(acc.id, ['keep-1'])
    expect(cancelled).toBe(2)

    const { rows } = await getTestPool().query(
      `SELECT external_id, status FROM conciliation_requests WHERE account_id = $1 ORDER BY external_id`,
      [acc.id]
    )
    const byExt: Record<string, string> = Object.fromEntries(rows.map((r: any) => [r.external_id, r.status]))
    expect(byExt['keep-1']).toBe('pending')
    expect(byExt['gone-1']).toBe('cancelled')
    expect(byExt['gone-2']).toBe('cancelled')
    expect(byExt['terminal']).toBe('matched')
  })

  it('withTx returns a new repo bound to the given executor', async () => {
    const user = await seedUser()
    const acc = await seedAccount(user.id)
    const baseRepo = buildRepo()
    const calls: string[] = []
    const fakeTx = {
      query: async (text: string, params?: any[]) => {
        calls.push(text)
        return getTestPool().query(text, params as any)
      },
    } as any

    const txRepo = baseRepo.withTx(fakeTx)
    expect(txRepo).not.toBe(baseRepo)
    const seeded = await insertConciliationRequest({ accountId: acc.id })
    const found = await txRepo.findById(seeded.id)
    expect(found).not.toBeNull()
    expect(calls.length).toBe(1)
  })
})
