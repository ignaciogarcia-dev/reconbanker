import { describe, it, expect, vi } from 'vitest'
import { BankRepository } from './BankRepository.js'
import { Bank } from '../domain/Bank.js'
import type { Executor } from './Executor.js'

function makeExecutor(rows: any[] = []): Executor {
  return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) }
}

describe('BankRepository', () => {
  it('withTx returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new BankRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(BankRepository)
    await txRepo.findAll()
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })

  it('save persists a bank with loginUrl null when missing', async () => {
    const exec = makeExecutor()
    const repo = new BankRepository(exec)
    const bank = Bank.reconstitute('b-1', { code: 'X', name: 'X bank', status: 'ready', createdAt: new Date() })
    await repo.save(bank)
    const [, params] = (exec.query as any).mock.calls[0]
    expect(params[3]).toBeNull()
  })
})
