import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { getMiDineroBank } from '../helpers/seed.js'
import { BankScriptRepository } from '../../../src/contexts/script-engine/infrastructure/BankScriptRepository.js'
import { executorFromPool } from '../../../src/contexts/script-engine/infrastructure/Executor.js'
import { BankScript } from '../../../src/contexts/script-engine/domain/BankScript.js'

/**
 * Removes any bank_scripts rows added during a test. Keeps the seed rows
 * created at migration time (their created_at is older than an hour).
 */
async function clearNonSeededScripts(): Promise<void> {
  await getTestPool().query(
    `DELETE FROM bank_scripts WHERE created_at > now() - interval '1 hour'`
  )
}

/**
 * Inserts a bank_scripts row with bank_id populated (the production repo
 * does not write bank_id today — see BUG note in the test report).
 */
async function insertScriptRow(opts: {
  id: string
  bank?: string
  flowType?: 'login' | 'extract_transactions' | 'verify_payment'
  version?: string
  status?: 'draft' | 'testing' | 'review' | 'active' | 'deprecated' | 'failed'
  origin?: 'system' | 'ai' | 'user'
  codeSnapshot?: string | null
  selectorMap?: Record<string, unknown>
  bankId: string
}): Promise<void> {
  await getTestPool().query(
    `INSERT INTO bank_scripts
       (id, bank, flow_type, version, status, origin, code_snapshot, selector_map, bank_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
    [
      opts.id,
      opts.bank ?? 'mi-dinero',
      opts.flowType ?? 'login',
      opts.version ?? '99.0.0',
      opts.status ?? 'review',
      opts.origin ?? 'user',
      opts.codeSnapshot ?? null,
      JSON.stringify(opts.selectorMap ?? {}),
      opts.bankId,
    ]
  )
}

describe('BankScriptRepository (integration)', () => {
  let repo: BankScriptRepository
  let bankId: string

  beforeAll(async () => {
    repo = new BankScriptRepository(executorFromPool(getTestPool()))
    const bank = await getMiDineroBank()
    bankId = bank.id
  })

  beforeEach(async () => {
    await truncateAll()
    await clearNonSeededScripts()
  })

  afterAll(async () => {
    await clearNonSeededScripts()
    await closeTestPool()
  })

  describe('findById', () => {
    it('returns the aggregate for a seeded id', async () => {
      const { rows } = await getTestPool().query(
        `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND status='active' LIMIT 1`
      )
      expect(rows[0]).toBeTruthy()
      const id: string = rows[0].id

      const script = await repo.findById(id)
      expect(script).not.toBeNull()
      expect(script!.id).toBe(id)
      expect(script!.bank).toBe('mi-dinero')
      expect(script!.status).toBe('active')
      expect(script!.flowType).toBe('extract_transactions')
    })

    it('returns null for an unknown UUID', async () => {
      const script = await repo.findById(crypto.randomUUID())
      expect(script).toBeNull()
    })
  })

  describe('findActive', () => {
    it('returns the active mi-dinero extract_transactions script', async () => {
      const script = await repo.findActive('mi-dinero', 'extract_transactions')
      expect(script).not.toBeNull()
      expect(script!.bank).toBe('mi-dinero')
      expect(script!.flowType).toBe('extract_transactions')
      expect(script!.status).toBe('active')
    })

    it('returns null when no active script exists for the bank/flow', async () => {
      const script = await repo.findActive('mi-dinero', 'login')
      expect(script).toBeNull()
    })
  })

  describe('findAll', () => {
    it('lists all scripts (including the mi-dinero seeded ones)', async () => {
      const list = await repo.findAll()
      const miDinero = list.filter((s) => s.bank === 'mi-dinero')
      expect(miDinero.length).toBeGreaterThanOrEqual(1)
      const active = miDinero.find((s) => s.status === 'active')
      expect(active).toBeTruthy()
      expect(active!.flowType).toBe('extract_transactions')
    })
  })

  describe('save', () => {
    it('INSERT path persists a new script and resolves bank_id from the bank code', async () => {
      const id = crypto.randomUUID()
      const script = BankScript.create(id, {
        bank: 'mi-dinero',
        flowType: 'login',
        version: '99.0.0',
        status: 'review',
        origin: 'user',
        selectorMap: { foo: 'bar' },
      })
      await repo.save(script)

      const { rows } = await getTestPool().query<{ bank_id: string; bank: string; status: string; selector_map: unknown }>(
        `SELECT bank_id, bank, status, selector_map FROM bank_scripts WHERE id = $1`,
        [id]
      )
      expect(rows[0].bank).toBe('mi-dinero')
      expect(rows[0].bank_id).toBe(bankId)
      expect(rows[0].status).toBe('review')
    })

    it('UPDATE path (ON CONFLICT id) updates status and code_snapshot', async () => {
      const id = crypto.randomUUID()
      await insertScriptRow({
        id,
        flowType: 'verify_payment',
        version: '99.0.1',
        status: 'review',
        codeSnapshot: 'v1',
        bankId,
      })

      const script = BankScript.reconstitute(id, {
        bank: 'mi-dinero',
        flowType: 'verify_payment',
        version: '99.0.1',
        status: 'review',
        origin: 'user',
        selectorMap: {},
        codeSnapshot: 'v2-updated',
        createdAt: new Date(),
      })
      script.promote() // review -> active

      await repo.save(script)
      const reloaded = await repo.findById(id)
      expect(reloaded!.status).toBe('active')
      expect(reloaded!.codeSnapshot).toBe('v2-updated')

      // Idempotency: re-saving the same state is a no-op (still active, same snapshot)
      await repo.save(script)
      const reloaded2 = await repo.findById(id)
      expect(reloaded2!.status).toBe('active')
      expect(reloaded2!.codeSnapshot).toBe('v2-updated')
      expect(reloaded2!.version).toBe('99.0.1')
    })
  })

  describe('deprecateActive', () => {
    it('flips the active script for (bank, flowType) to deprecated', async () => {
      const id = crypto.randomUUID()
      await insertScriptRow({
        id,
        flowType: 'verify_payment',
        version: '50.0.0',
        status: 'active',
        origin: 'system',
        bankId,
      })

      await repo.deprecateActive('mi-dinero', 'verify_payment')

      const { rows } = await getTestPool().query(
        `SELECT status FROM bank_scripts WHERE id = $1`,
        [id]
      )
      expect(rows[0].status).toBe('deprecated')
    })
  })

  describe('withTx', () => {
    it('returns a new repository bound to the supplied executor', async () => {
      const tx = executorFromPool(getTestPool())
      const txRepo = repo.withTx(tx)
      expect(txRepo).toBeInstanceOf(BankScriptRepository)
      expect(txRepo).not.toBe(repo)

      const list = await txRepo.findAll()
      expect(list.length).toBeGreaterThan(0)
    })
  })
})
