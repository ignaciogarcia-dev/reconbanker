import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { getMiDineroBank, seedUser } from '../helpers/seed.js'
import { BankScriptRepository } from '../../../src/contexts/script-engine/infrastructure/BankScriptRepository.js'
import { executorFromPool } from '../../../src/contexts/script-engine/infrastructure/Executor.js'
import { PromoteScriptUseCase } from '../../../src/contexts/script-engine/application/PromoteScriptUseCase.js'
import { PgUnitOfWork } from '../../../src/shared/persistence/PgUnitOfWork.js'
import { InMemoryEventBus } from '../../../src/shared/events/InMemoryEventBus.js'
import { ConflictError, ForbiddenError, NotFoundError } from '../../../src/shared/errors/index.js'

async function clearNonSeededScripts(): Promise<void> {
  await getTestPool().query(
    `DELETE FROM bank_scripts WHERE created_at > now() - interval '1 hour'`
  )
}

async function insertReviewScript(opts: {
  id: string
  bankId: string
  userId: string
  flowType?: 'login' | 'extract_transactions' | 'verify_payment'
  version?: string
  status?: 'review' | 'active' | 'deprecated'
}): Promise<void> {
  await getTestPool().query(
    `INSERT INTO bank_scripts
       (id, bank, flow_type, version, status, origin, selector_map, bank_id, user_id, created_at)
     VALUES ($1, 'mi-dinero', $2, $3, $4, 'user', '{}', $5, $6, now())`,
    [opts.id, opts.flowType ?? 'extract_transactions', opts.version ?? '3.0.0', opts.status ?? 'review', opts.bankId, opts.userId]
  )
}

describe('PromoteScriptUseCase (integration)', () => {
  let repo: BankScriptRepository
  let useCase: PromoteScriptUseCase
  let bus: InMemoryEventBus
  let bankId: string

  beforeAll(async () => {
    const pool = getTestPool()
    repo = new BankScriptRepository(executorFromPool(pool))
    bus = new InMemoryEventBus()
    useCase = new PromoteScriptUseCase(repo, new PgUnitOfWork(pool), bus)
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

  it("promotes the owner's review script and deprecates their own previously active one atomically", async () => {
    const owner = await seedUser()
    const previousId = crypto.randomUUID()
    const candidateId = crypto.randomUUID()
    await insertReviewScript({ id: previousId, bankId, userId: owner.id, version: '2.9.0', status: 'active' })
    await insertReviewScript({ id: candidateId, bankId, userId: owner.id, version: '3.0.0', status: 'review' })

    await useCase.execute({ scriptId: candidateId, callerId: owner.id })

    const { rows: candidateRow } = await getTestPool().query(
      `SELECT status FROM bank_scripts WHERE id = $1`,
      [candidateId]
    )
    expect(candidateRow[0].status).toBe('active')

    const { rows: previousRow } = await getTestPool().query(
      `SELECT status FROM bank_scripts WHERE id = $1`,
      [previousId]
    )
    expect(previousRow[0].status).toBe('deprecated')

    // The official system script for mi-dinero/extract_transactions is untouched.
    const { rows: systemRows } = await getTestPool().query(
      `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active' AND user_id IS NULL`
    )
    expect(systemRows.length).toBe(1)
  })

  it('publishes a ScriptPromoted event', async () => {
    const owner = await seedUser()
    const candidateId = crypto.randomUUID()
    await insertReviewScript({ id: candidateId, bankId, userId: owner.id, version: '3.0.1', status: 'review' })

    const handler = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('ScriptPromoted', handler)

    await useCase.execute({ scriptId: candidateId, callerId: owner.id })

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0]
    expect(event.eventType).toBe('ScriptPromoted')
    expect(event.aggregateId).toBe(candidateId)
    expect(event.bank).toBe('mi-dinero')
    expect(event.flowType).toBe('extract_transactions')
    expect(event.version).toBe('3.0.1')
  })

  it('throws ConflictError when the script is already active and leaves DB unchanged', async () => {
    const owner = await seedUser()
    const activeId = crypto.randomUUID()
    await insertReviewScript({ id: activeId, bankId, userId: owner.id, version: '3.0.2', status: 'active' })

    await expect(useCase.execute({ scriptId: activeId, callerId: owner.id })).rejects.toBeInstanceOf(ConflictError)

    const { rows: afterRows } = await getTestPool().query(
      `SELECT id, status FROM bank_scripts WHERE id = $1`,
      [activeId]
    )
    expect(afterRows[0].status).toBe('active')
  })

  it('throws NotFoundError when the scriptId does not exist', async () => {
    const owner = await seedUser()
    await expect(
      useCase.execute({ scriptId: crypto.randomUUID(), callerId: owner.id })
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws NotFoundError (masking existence) when the script is privately owned by someone else', async () => {
    const owner = await seedUser()
    const other = await seedUser()
    const candidateId = crypto.randomUUID()
    await insertReviewScript({ id: candidateId, bankId, userId: owner.id, version: '3.0.3', status: 'review' })

    await expect(
      useCase.execute({ scriptId: candidateId, callerId: other.id })
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws ForbiddenError when a regular caller tries to promote the official system script', async () => {
    const caller = await seedUser()
    const { rows: beforeRows } = await getTestPool().query(
      `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND status='active' AND user_id IS NULL LIMIT 1`
    )
    const systemScriptId = beforeRows[0].id

    await expect(
      useCase.execute({ scriptId: systemScriptId, callerId: caller.id })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})
