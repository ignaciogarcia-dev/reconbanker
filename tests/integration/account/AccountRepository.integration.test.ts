import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, getMiDineroBank } from '../helpers/seed.js'
import { AccountRepository } from '../../../src/contexts/account/infrastructure/AccountRepository.js'
import { executorFromPool } from '../../../src/contexts/account/infrastructure/Executor.js'
import { Account } from '../../../src/contexts/account/domain/Account.js'

describe('AccountRepository (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  function makeRepo() {
    return new AccountRepository(executorFromPool(getTestPool()))
  }

  describe('findById', () => {
    it('returns the account when it exists', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id, { name: 'find-me' })
      const repo = makeRepo()
      const found = await repo.findById(acc.id)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(acc.id)
      expect(found!.userId).toBe(user.id)
      expect(found!.bank).toBe('mi-dinero')
      expect(found!.name).toBe('find-me')
    })

    it('returns null when the account does not exist', async () => {
      const repo = makeRepo()
      const result = await repo.findById(crypto.randomUUID())
      expect(result).toBeNull()
    })
  })

  describe('findByIdForUser', () => {
    it('returns the account when it belongs to the user', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      const found = await repo.findByIdForUser(acc.id, user.id)
      expect(found?.id).toBe(acc.id)
    })

    it('returns null when the account belongs to another user', async () => {
      const owner = await seedUser({ email: 'owner@test.com' })
      const stranger = await seedUser({ email: 'stranger@test.com' })
      const acc = await seedAccount(owner.id)
      const repo = makeRepo()
      const found = await repo.findByIdForUser(acc.id, stranger.id)
      expect(found).toBeNull()
    })
  })

  describe('findAllByUser', () => {
    it('returns only active accounts belonging to the user', async () => {
      const user = await seedUser()
      const other = await seedUser({ email: 'other@test.com' })
      const a1 = await seedAccount(user.id, { name: 'a1' })
      const a2 = await seedAccount(user.id, { name: 'a2' })
      await seedAccount(other.id, { name: 'other' })

      // Mark a2 as inactive — should be filtered out
      await getTestPool().query(`UPDATE accounts SET status = 'inactive' WHERE id = $1`, [a2.id])

      const repo = makeRepo()
      const list = await repo.findAllByUser(user.id)
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(a1.id)
    })

    it('returns empty array when user has no accounts', async () => {
      const user = await seedUser()
      const repo = makeRepo()
      const list = await repo.findAllByUser(user.id)
      expect(list).toEqual([])
    })
  })

  describe('save', () => {
    it('inserts a new account', async () => {
      const user = await seedUser()
      const bank = await getMiDineroBank()
      const repo = makeRepo()
      const id = crypto.randomUUID()
      const account = Account.create(id, user.id, bank.id, bank.code, 'fresh')
      await repo.save(account)

      const found = await repo.findById(id)
      expect(found?.name).toBe('fresh')
      expect(found?.status).toBe('active')
    })

    it('updates name and status on conflict (idempotent)', async () => {
      const user = await seedUser()
      const bank = await getMiDineroBank()
      const repo = makeRepo()
      const id = crypto.randomUUID()
      const account = Account.create(id, user.id, bank.id, bank.code, 'first')
      await repo.save(account)
      await repo.save(account)
      await repo.save(account)

      const { rows } = await getTestPool().query('SELECT COUNT(*)::int AS n FROM accounts WHERE id=$1', [id])
      expect(rows[0].n).toBe(1)
    })
  })

  describe('delete', () => {
    it('removes the account by id', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.delete(acc.id)

      const found = await repo.findById(acc.id)
      expect(found).toBeNull()
    })
  })

  describe('withTx', () => {
    it('returns a new repository instance bound to the provided executor', async () => {
      const user = await seedUser()
      const bank = await getMiDineroBank()
      const pool = getTestPool()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const txExec = { query: (text: string, params?: unknown[]) => client.query(text, params as any) }
        const baseRepo = makeRepo()
        const txRepo = baseRepo.withTx(txExec as any)
        expect(txRepo).not.toBe(baseRepo)

        const id = crypto.randomUUID()
        const account = Account.create(id, user.id, bank.id, bank.code, 'tx-only')
        await txRepo.save(account)

        // Inside the tx, it's visible
        const inside = await txRepo.findById(id)
        expect(inside?.id).toBe(id)

        // Outside the tx (different connection), not yet visible
        const outside = await baseRepo.findById(id)
        expect(outside).toBeNull()

        await client.query('ROLLBACK')

        const afterRollback = await baseRepo.findById(id)
        expect(afterRollback).toBeNull()
      } finally {
        client.release()
      }
    })
  })
})
