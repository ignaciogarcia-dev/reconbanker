import { describe, it, expect, vi } from 'vitest'
import { ScrapeRunRepository } from './ScrapeRunRepository.js'
import type { Executor } from './Executor.js'

function makeExecutor(): Executor {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
}

describe('ScrapeRunRepository.withTx', () => {
  it('returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new ScrapeRunRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(ScrapeRunRepository)
    await txRepo.create('run-1', 'acc-1', 'script-1')
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })
})
