import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { UserRepository } from '../../../src/contexts/user/infrastructure/UserRepository.js'
import { executorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'
import { UserDataCleanerAdapter } from '../../../src/contexts/user/infrastructure/adapters/UserDataCleanerAdapter.js'
import { ChangeOperationModeUseCase } from '../../../src/contexts/user/application/ChangeOperationModeUseCase.js'
import { PgUnitOfWork } from '../../../src/shared/persistence/PgUnitOfWork.js'
import { InMemoryEventBus } from '../../../src/shared/events/InMemoryEventBus.js'
import { NotFoundError } from '../../../src/shared/errors/index.js'
import type { IUserDataCleaner } from '../../../src/contexts/user/domain/ports/IUserDataCleaner.js'
import type { Tx } from '../../../src/shared/persistence/Tx.js'

interface Seeded {
  userId: string
  accountId: string
  txId: string
  requestId: string
  conciliatedId: string
}

/** Insert some bank_transactions, conciliation_requests, and conciliated_transactions for the account. */
async function seedAccountData(userId: string, accountId: string): Promise<Seeded> {
  const pool = getTestPool()
  const txId = crypto.randomUUID()
  const requestId = crypto.randomUUID()
  const conciliatedId = crypto.randomUUID()

  await pool.query(
    `INSERT INTO bank_transactions
       (id, account_id, external_id, reference_hash, amount, currency, received_at)
     VALUES ($1, $2, 'ext-1', 'hash-1', 100.00, 'ARS', now())`,
    [txId, accountId]
  )
  await pool.query(
    `INSERT INTO conciliation_requests
       (id, account_id, external_id, expected_amount, currency, status)
     VALUES ($1, $2, 'ext-req-1', 100.00, 'ARS', 'pending')`,
    [requestId, accountId]
  )
  await pool.query(
    `INSERT INTO conciliated_transactions
       (id, account_id, request_id, bank_transaction_id, matched_by)
     VALUES ($1, $2, $3, $4, 'amount')`,
    [conciliatedId, accountId, requestId, txId]
  )
  await pool.query(
    `INSERT INTO webhook_notifications
       (id, account_id, subject_type, subject_id, url, request_payload, response_status, attempt)
     VALUES (gen_random_uuid(), $1, 'bank_transaction', $2, 'https://hook', '{}'::jsonb, 200, 1)`,
    [accountId, txId]
  )
  await pool.query(
    `INSERT INTO webhook_dead_letters
       (id, account_id, subject_type, subject_id, last_status, last_error, attempts)
     VALUES (gen_random_uuid(), $1, 'bank_transaction', $2, 500, 'boom', 12)`,
    [accountId, txId]
  )

  return { userId, accountId, txId, requestId, conciliatedId }
}

async function countDataFor(accountId: string): Promise<{ bt: number; cr: number; ct: number; wn: number; wdl: number }> {
  const pool = getTestPool()
  const bt = await pool.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM bank_transactions WHERE account_id = $1', [accountId]
  )
  const cr = await pool.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM conciliation_requests WHERE account_id = $1', [accountId]
  )
  const ct = await pool.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM conciliated_transactions WHERE account_id = $1', [accountId]
  )
  const wn = await pool.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM webhook_notifications WHERE account_id = $1', [accountId]
  )
  const wdl = await pool.query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM webhook_dead_letters WHERE account_id = $1', [accountId]
  )
  return { bt: bt.rows[0].n, cr: cr.rows[0].n, ct: ct.rows[0].n, wn: wn.rows[0].n, wdl: wdl.rows[0].n }
}

describe('ChangeOperationModeUseCase (integration)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('changes mode, wipes account data, and publishes OperationModeChanged', async () => {
    const seededUser = await seedUser({ email: 'change-mode@test.com', operationMode: 'reconcile' })
    const account = await seedAccount(seededUser.id)
    const data = await seedAccountData(seededUser.id, account.id)

    // Sanity: data is there before the use case runs
    const before = await countDataFor(account.id)
    expect(before).toEqual({ bt: 1, cr: 1, ct: 1, wn: 1, wdl: 1 })
    void data

    const pool = getTestPool()
    const repo = new UserRepository(executorFromPool(pool))
    const uow = new PgUnitOfWork(pool)
    const cleaner = new UserDataCleanerAdapter()
    const eventBus = new InMemoryEventBus()

    const received: Array<{ type: string; aggregateId: string; mode?: string }> = []
    eventBus.subscribe('OperationModeChanged', async (event: any) => {
      received.push({ type: event.eventType, aggregateId: event.aggregateId, mode: event.mode })
    })

    const useCase = new ChangeOperationModeUseCase(repo, uow, cleaner, eventBus)
    const result = await useCase.execute({ userId: seededUser.id, mode: 'passthrough' })

    expect(result.mode).toBe('passthrough')

    // User mode updated in DB
    const mode = await repo.getOperationMode(seededUser.id)
    expect(mode).toBe('passthrough')

    // Account-scoped data was wiped
    const after = await countDataFor(account.id)
    expect(after).toEqual({ bt: 0, cr: 0, ct: 0, wn: 0, wdl: 0 })

    // Event was published
    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({
      type: 'OperationModeChanged',
      aggregateId: seededUser.id,
      mode: 'passthrough',
    })
  })

  it('throws NotFoundError when user does not exist', async () => {
    const pool = getTestPool()
    const repo = new UserRepository(executorFromPool(pool))
    const uow = new PgUnitOfWork(pool)
    const cleaner = new UserDataCleanerAdapter()
    const eventBus = new InMemoryEventBus()
    const useCase = new ChangeOperationModeUseCase(repo, uow, cleaner, eventBus)

    await expect(
      useCase.execute({ userId: crypto.randomUUID(), mode: 'passthrough' })
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('rolls back mode change AND restores wipe if the cleaner fails mid-UoW', async () => {
    const seededUser = await seedUser({ email: 'rollback@test.com', operationMode: 'reconcile' })
    const account = await seedAccount(seededUser.id)
    await seedAccountData(seededUser.id, account.id)

    const pool = getTestPool()
    const repo = new UserRepository(executorFromPool(pool))
    const uow = new PgUnitOfWork(pool)
    const eventBus = new InMemoryEventBus()

    // Cleaner that deletes user-scoped rows (in the right FK order) inside the
    // tx and then throws. If UoW rolls back correctly, those DELETEs are undone too.
    const failingCleaner: IUserDataCleaner = {
      async wipeForUser(tx: Tx, userId: string): Promise<void> {
        const scope = `account_id IN (SELECT id FROM accounts WHERE user_id = $1)`
        await tx.query(`DELETE FROM conciliated_transactions WHERE ${scope}`, [userId])
        await tx.query(`DELETE FROM conciliation_attempts WHERE ${scope}`, [userId])
        await tx.query(`DELETE FROM conciliation_requests WHERE ${scope}`, [userId])
        await tx.query(`DELETE FROM bank_transactions WHERE ${scope}`, [userId])
        throw new Error('cleaner exploded')
      },
    }

    const received: any[] = []
    eventBus.subscribe('OperationModeChanged', async (e) => { received.push(e) })

    const useCase = new ChangeOperationModeUseCase(repo, uow, failingCleaner, eventBus)
    await expect(
      useCase.execute({ userId: seededUser.id, mode: 'passthrough' })
    ).rejects.toThrow('cleaner exploded')

    // Mode change must NOT have persisted (rollback)
    const mode = await repo.getOperationMode(seededUser.id)
    expect(mode).toBe('reconcile')

    // The delete inside the tx must also have been rolled back
    const after = await countDataFor(account.id)
    expect(after.bt).toBe(1)

    // No event published — execute threw before publishAll
    expect(received).toHaveLength(0)
  })
})
