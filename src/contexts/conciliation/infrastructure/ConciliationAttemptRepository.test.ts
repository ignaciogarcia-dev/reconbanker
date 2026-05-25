import { describe, it, expect, vi } from 'vitest'
import { ConciliationAttemptRepository } from './ConciliationAttemptRepository.js'
import type { Executor } from './Executor.js'

function makeExecutor(): Executor {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
}

describe('ConciliationAttemptRepository.withTx', () => {
  it('returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new ConciliationAttemptRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(ConciliationAttemptRepository)
    await txRepo.save({
      id: 'att-1', accountId: 'acc-1', requestId: 'req-1',
      attemptNumber: 1, status: 'success', candidateIds: ['tx-1'],
    })
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })
})
