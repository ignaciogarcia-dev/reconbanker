import { describe, it, expect, vi } from 'vitest'
import { BankSessionRepository } from './BankSessionRepository.js'
import type { Executor } from './Executor.js'

function makeExecutor(): Executor {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
}

describe('BankSessionRepository.withTx', () => {
  it('returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new BankSessionRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(BankSessionRepository)
    await txRepo.markRunning('acc-1')
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })
})
