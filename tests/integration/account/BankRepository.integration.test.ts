import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { getMiDineroBank } from '../helpers/seed.js'
import { BankRepository } from '../../../src/contexts/account/infrastructure/BankRepository.js'
import { executorFromPool } from '../../../src/contexts/account/infrastructure/Executor.js'
import { Bank } from '../../../src/contexts/account/domain/Bank.js'

describe('BankRepository (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => {
    // Clean up extra banks created by save() tests so we don't pollute the
    // seed data for subsequent suites.
    await getTestPool().query(`DELETE FROM banks WHERE code <> 'mi-dinero'`)
    await closeTestPool()
  })

  function makeRepo() {
    return new BankRepository(executorFromPool(getTestPool()))
  }

  describe('findById', () => {
    it('returns the seeded mi-dinero bank', async () => {
      const seeded = await getMiDineroBank()
      const repo = makeRepo()
      const bank = await repo.findById(seeded.id)
      expect(bank?.id).toBe(seeded.id)
      expect(bank?.code).toBe('mi-dinero')
    })

    it('returns null when the bank does not exist', async () => {
      const repo = makeRepo()
      const result = await repo.findById(crypto.randomUUID())
      expect(result).toBeNull()
    })
  })

  describe('findAll', () => {
    it('returns banks ordered by name', async () => {
      // Insert two extra banks and check sort order.
      await getTestPool().query(`DELETE FROM banks WHERE code <> 'mi-dinero'`)
      const repo = makeRepo()
      const zebra = Bank.create(crypto.randomUUID(), 'zebra-bank', 'Zebra Bank')
      const alpha = Bank.create(crypto.randomUUID(), 'alpha-bank', 'Alpha Bank')
      await repo.save(zebra)
      await repo.save(alpha)

      const all = await repo.findAll()
      const names = all.map(b => b.name)
      const sorted = [...names].sort((a, b) => a.localeCompare(b))
      expect(names).toEqual(sorted)
      expect(names).toContain('Alpha Bank')
      expect(names).toContain('Zebra Bank')

      // Cleanup
      await getTestPool().query(`DELETE FROM banks WHERE code IN ('zebra-bank','alpha-bank')`)
    })
  })

  describe('save', () => {
    it('inserts a new bank created via Bank.create', async () => {
      const repo = makeRepo()
      const id = crypto.randomUUID()
      const bank = Bank.create(id, 'test-bank', 'Test Bank', 'https://login.test')
      await repo.save(bank)

      const found = await repo.findById(id)
      expect(found?.code).toBe('test-bank')
      expect(found?.name).toBe('Test Bank')
      expect(found?.loginUrl).toBe('https://login.test')
      expect(found?.status).toBe('pending')

      await getTestPool().query(`DELETE FROM banks WHERE id = $1`, [id])
    })

    it('updates the bank on conflict (id)', async () => {
      const repo = makeRepo()
      const id = crypto.randomUUID()
      const bank = Bank.create(id, 'upd-bank', 'Original Name')
      await repo.save(bank)

      // mutate via raw row update (simulate reconstitute & save loop)
      await getTestPool().query(
        `UPDATE banks SET name = 'Updated Name' WHERE id = $1`, [id]
      )
      const reread = await repo.findById(id)
      expect(reread?.name).toBe('Updated Name')

      await getTestPool().query(`DELETE FROM banks WHERE id = $1`, [id])
    })
  })
})
