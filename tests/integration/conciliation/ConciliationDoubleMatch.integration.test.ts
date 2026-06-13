import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { insertConciliationRequest, insertBankTransaction } from './helpers.js'
import { executorFromPool } from '../../../src/contexts/conciliation/infrastructure/Executor.js'
import { ConciliationRequestRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliationRequestRepository.js'
import { ConciliatedTransactionRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliatedTransactionRepository.js'
import { ConciliationAttemptRepository } from '../../../src/contexts/conciliation/infrastructure/ConciliationAttemptRepository.js'
import { BankTransactionRepository } from '../../../src/contexts/banking/infrastructure/BankTransactionRepository.js'
import { BankTransactionFinderAdapter } from '../../../src/contexts/conciliation/infrastructure/adapters/BankTransactionFinderAdapter.js'
import { ConciliationEngine } from '../../../src/contexts/conciliation/domain/ConciliationEngine.js'
import { RunConciliationUseCase } from '../../../src/contexts/conciliation/application/RunConciliationUseCase.js'
import { PgUnitOfWork } from '../../../src/shared/persistence/PgUnitOfWork.js'
import { InMemoryEventBus } from '../../../src/shared/events/InMemoryEventBus.js'

function buildRunConciliation() {
  const pool = getTestPool()
  const exec = executorFromPool(pool)
  const bankTxRepo = new BankTransactionRepository(exec)
  return new RunConciliationUseCase({
    unitOfWork: new PgUnitOfWork(pool),
    eventBus: new InMemoryEventBus(),
    requestRepo: new ConciliationRequestRepository(exec),
    attemptRepo: new ConciliationAttemptRepository(exec),
    matchRepo: new ConciliatedTransactionRepository(exec),
    bankTransactionFinder: new BankTransactionFinderAdapter(exec, bankTxRepo),
    engine: new ConciliationEngine(),
  })
}

describe('conciliation double-match (C1)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('the unique index rejects a second primary match for the same bank transaction', async () => {
    const user = await seedUser({})
    const account = await seedAccount(user.id)
    const r1 = await insertConciliationRequest({ accountId: account.id })
    const r2 = await insertConciliationRequest({ accountId: account.id })
    const tx = await insertBankTransaction({ accountId: account.id })

    const insertMatch = (requestId: string) =>
      getTestPool().query(
        `INSERT INTO conciliated_transactions
           (id, account_id, request_id, bank_transaction_id, matched_by, is_primary, matched_at, created_at, is_notified)
         VALUES ($1,$2,$3,$4,'engine',true,now(),now(),false)`,
        [crypto.randomUUID(), account.id, requestId, tx.id]
      )

    await insertMatch(r1.id)
    await expect(insertMatch(r2.id)).rejects.toThrow(/uq_conciliated_bank_tx_primary|unique/i)
  })

  it('two requests racing for the same single transaction yield exactly one match', async () => {
    const user = await seedUser({})
    const account = await seedAccount(user.id)
    // Both requests match the same incoming transaction (same amount + sender).
    const r1 = await insertConciliationRequest({ accountId: account.id, expectedAmount: 100, senderName: 'Alice' })
    const r2 = await insertConciliationRequest({ accountId: account.id, expectedAmount: 100, senderName: 'Alice' })
    await insertBankTransaction({ accountId: account.id, amount: 100, senderName: 'Alice' })

    const useCase = buildRunConciliation()
    const results = await Promise.allSettled([
      useCase.execute({ requestId: r1.id }),
      useCase.execute({ requestId: r2.id }),
    ])

    // At most one transaction may be conciliated, regardless of interleaving.
    const { rows } = await getTestPool().query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM conciliated_transactions'
    )
    expect(rows[0].n).toBe(1)

    const matched = await getTestPool().query<{ status: string }>(
      `SELECT status FROM conciliation_requests WHERE status = 'matched'`
    )
    expect(matched.rows).toHaveLength(1)
    // Both executions complete WITHOUT throwing: the winner conciliates, and the
    // loser of the unique-index race aborts cleanly instead of surfacing a DB error.
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
  })
})
