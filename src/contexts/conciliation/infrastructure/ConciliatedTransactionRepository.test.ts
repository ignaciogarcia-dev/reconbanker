import { describe, it, expect, vi } from 'vitest'
import { ConciliatedTransactionRepository } from './ConciliatedTransactionRepository.js'
import type { Executor } from './Executor.js'

function makeExecutor(rows: any[] = []): Executor {
  return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) }
}

describe('ConciliatedTransactionRepository.withTx', () => {
  it('returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new ConciliatedTransactionRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(ConciliatedTransactionRepository)
    await txRepo.markNotified('match-1')
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })
})
