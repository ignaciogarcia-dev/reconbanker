import { describe, it, expect, vi } from 'vitest'
import { BankCredentialsRepository } from './BankCredentialsRepository.js'
import type { Executor } from './Executor.js'

function makeExecutor(rows: any[] = []): Executor {
  return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) }
}

describe('BankCredentialsRepository.withTx', () => {
  it('returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new BankCredentialsRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(BankCredentialsRepository)
    await txRepo.deleteByAccountId('acc-1')
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })
})
