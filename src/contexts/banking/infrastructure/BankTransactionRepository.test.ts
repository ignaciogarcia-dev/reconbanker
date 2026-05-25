import { describe, it, expect, vi } from 'vitest'
import { BankTransactionRepository } from './BankTransactionRepository.js'
import type { Executor } from './Executor.js'

function makeExecutor(rows: any[] = [], rowCount?: number | null): Executor {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rowCount === undefined ? rows.length : rowCount }),
  }
}

describe('BankTransactionRepository', () => {
  it('withTx returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new BankTransactionRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(BankTransactionRepository)
    await txRepo.markNotified('tx-1')
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })

  it('findByExternalId returns null when no rows', async () => {
    const exec = makeExecutor([])
    const repo = new BankTransactionRepository(exec)
    expect(await repo.findByExternalId('acc-1', 'ext-1')).toBeNull()
  })

  it('findByExternalId maps the row when present', async () => {
    const exec = makeExecutor([{
      id: 'tx-1', account_id: 'acc-1', external_id: 'ext-1',
      reference_hash: 'h', amount: '100', currency: 'USD', sender_name: 'A',
      received_at: new Date(), script_id: 's-1', ingested_at: new Date(),
      raw_payload: '{}', excluded_at: null, notified_at: null,
    }])
    const repo = new BankTransactionRepository(exec)
    const out = await repo.findByExternalId('acc-1', 'ext-1')
    expect(out?.id).toBe('tx-1')
  })

  it('claimNotification returns false when rowCount is null', async () => {
    const exec = makeExecutor([], null)
    const repo = new BankTransactionRepository(exec)
    expect(await repo.claimNotification('tx-1')).toBe(false)
  })

  it('claimNotification returns true when rowCount is positive', async () => {
    const exec = makeExecutor([], 1)
    const repo = new BankTransactionRepository(exec)
    expect(await repo.claimNotification('tx-1')).toBe(true)
  })
})
