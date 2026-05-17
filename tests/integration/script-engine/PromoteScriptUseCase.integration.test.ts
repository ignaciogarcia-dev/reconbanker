import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { getMiDineroBank } from '../helpers/seed.js'
import { BankScriptRepository } from '../../../src/contexts/script-engine/infrastructure/BankScriptRepository.js'
import { executorFromPool } from '../../../src/contexts/script-engine/infrastructure/Executor.js'
import { PromoteScriptUseCase } from '../../../src/contexts/script-engine/application/PromoteScriptUseCase.js'
import { PgUnitOfWork } from '../../../src/shared/persistence/PgUnitOfWork.js'
import { InMemoryEventBus } from '../../../src/shared/events/InMemoryEventBus.js'
import { ConflictError, NotFoundError } from '../../../src/shared/errors/index.js'

async function clearNonSeededScripts(): Promise<void> {
  await getTestPool().query(
    `DELETE FROM bank_scripts WHERE created_at > now() - interval '1 hour'`
  )
}

async function insertReviewScript(opts: {
  id: string
  bankId: string
  flowType?: 'login' | 'extract_transactions' | 'verify_payment'
  version?: string
  status?: 'review' | 'active' | 'deprecated'
}): Promise<void> {
  await getTestPool().query(
    `INSERT INTO bank_scripts
       (id, bank, flow_type, version, status, origin, selector_map, bank_id, created_at)
     VALUES ($1, 'mi-dinero', $2, $3, $4, 'user', '{}', $5, now())`,
    [opts.id, opts.flowType ?? 'extract_transactions', opts.version ?? '3.0.0', opts.status ?? 'review', opts.bankId]
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

  it('promotes a review script and deprecates the previously active one atomically', async () => {
    const candidateId = crypto.randomUUID()
    await insertReviewScript({ id: candidateId, bankId, version: '3.0.0', status: 'review' })

    // Identify the seeded active script for mi-dinero/extract_transactions
    const { rows: beforeRows } = await getTestPool().query(
      `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active'`
    )
    expect(beforeRows.length).toBe(1)
    const previousActiveId = beforeRows[0].id

    await useCase.execute({ scriptId: candidateId })

    const { rows: candidateRow } = await getTestPool().query(
      `SELECT status FROM bank_scripts WHERE id = $1`,
      [candidateId]
    )
    expect(candidateRow[0].status).toBe('active')

    const { rows: previousRow } = await getTestPool().query(
      `SELECT status FROM bank_scripts WHERE id = $1`,
      [previousActiveId]
    )
    expect(previousRow[0].status).toBe('deprecated')

    // Invariant: exactly one active row for (mi-dinero, extract_transactions)
    const { rows: activeRows } = await getTestPool().query(
      `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active'`
    )
    expect(activeRows.length).toBe(1)
    expect(activeRows[0].id).toBe(candidateId)
  })

  it('publishes a ScriptPromoted event', async () => {
    const candidateId = crypto.randomUUID()
    await insertReviewScript({ id: candidateId, bankId, version: '3.0.1', status: 'review' })

    const handler = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('ScriptPromoted', handler)

    await useCase.execute({ scriptId: candidateId })

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0]
    expect(event.eventType).toBe('ScriptPromoted')
    expect(event.aggregateId).toBe(candidateId)
    expect(event.bank).toBe('mi-dinero')
    expect(event.flowType).toBe('extract_transactions')
    expect(event.version).toBe('3.0.1')
  })

  it('throws ConflictError when the script is already active and leaves DB unchanged', async () => {
    const { rows: beforeRows } = await getTestPool().query(
      `SELECT id, status FROM bank_scripts WHERE bank='mi-dinero' AND status='active' LIMIT 1`
    )
    const activeId = beforeRows[0].id

    await expect(useCase.execute({ scriptId: activeId })).rejects.toBeInstanceOf(ConflictError)

    const { rows: afterRows } = await getTestPool().query(
      `SELECT id, status FROM bank_scripts WHERE id = $1`,
      [activeId]
    )
    expect(afterRows[0].status).toBe('active')

    // Only one active row should still exist for that (bank, flow)
    const { rows: activeRows } = await getTestPool().query(
      `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active'`
    )
    expect(activeRows.length).toBe(1)
    expect(activeRows[0].id).toBe(activeId)
  })

  it('throws NotFoundError when the scriptId does not exist', async () => {
    await expect(
      useCase.execute({ scriptId: crypto.randomUUID() })
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
