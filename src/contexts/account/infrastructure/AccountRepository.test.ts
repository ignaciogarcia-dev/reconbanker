import { describe, it, expect, vi } from 'vitest'
import { AccountRepository } from './AccountRepository.js'
import { Account } from '../domain/Account.js'
import type { Executor } from './Executor.js'

function makeExecutor(rows: any[] = []): Executor {
  return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) }
}

describe('AccountRepository', () => {
  it('withTx returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new AccountRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(AccountRepository)
    await txRepo.delete('acc-1')
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })

  it('save persists the account with a name', async () => {
    const exec = makeExecutor()
    const repo = new AccountRepository(exec)
    const account = Account.create('acc-1', 'user-1', 'bank-1', 'TEST', 'My Account')
    await repo.save(account)
    expect(exec.query).toHaveBeenCalledTimes(1)
    const [, params] = (exec.query as any).mock.calls[0]
    expect(params[4]).toBe('My Account')
  })

  it('save persists the account with null when name is missing', async () => {
    const exec = makeExecutor()
    const repo = new AccountRepository(exec)
    const account = Account.create('acc-1', 'user-1', 'bank-1', 'TEST')
    await repo.save(account)
    const [, params] = (exec.query as any).mock.calls[0]
    expect(params[4]).toBeNull()
  })

  it('clearScrapeBlock issues an UPDATE on the account row', async () => {
    const exec = makeExecutor()
    const repo = new AccountRepository(exec)
    await repo.clearScrapeBlock('acc-1')
    const [sql, params] = (exec.query as any).mock.calls[0]
    expect(sql).toContain('scrape_blocked_at = NULL')
    expect(params).toEqual(['acc-1'])
  })
})
