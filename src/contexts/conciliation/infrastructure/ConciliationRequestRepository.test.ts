import { describe, it, expect, vi } from 'vitest'
import { ConciliationRequestRepository } from './ConciliationRequestRepository.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'
import type { Executor } from './Executor.js'

function makeExecutor(rows: any[] = [], rowCount?: number | null): Executor {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rowCount === undefined ? rows.length : rowCount }),
  }
}

describe('ConciliationRequestRepository', () => {
  it('withTx returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor()
    const repo = new ConciliationRequestRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(ConciliationRequestRepository)
    await txRepo.findById('req-1')
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })

  it('findByIdForUpdate maps the row when present', async () => {
    const exec = makeExecutor([{
      id: 'req-1', account_id: 'acc-1', external_id: 'ext-1',
      expected_amount: '100', currency: 'USD', sender_name: 'Alice',
      status: 'pending', idempotency_key: null, retry_count: 0,
      last_checked_at: null, created_at: new Date(),
    }])
    const repo = new ConciliationRequestRepository(exec)
    const out = await repo.findByIdForUpdate('req-1')
    expect(out?.id).toBe('req-1')
  })

  it('findByIdForUpdate returns null when no row', async () => {
    const exec = makeExecutor([])
    const repo = new ConciliationRequestRepository(exec)
    expect(await repo.findByIdForUpdate('req-1')).toBeNull()
  })

  it('cancelMissing returns 0 when rowCount is null', async () => {
    const exec = makeExecutor([], null)
    const repo = new ConciliationRequestRepository(exec)
    expect(await repo.cancelMissing('acc-1', ['ext-1'])).toBe(0)
  })

  it('cancelMissing returns rowCount when positive', async () => {
    const exec = makeExecutor([], 3)
    const repo = new ConciliationRequestRepository(exec)
    expect(await repo.cancelMissing('acc-1', ['ext-1'])).toBe(3)
  })

  it('save passes null for optional senderName/idempotencyKey/lastCheckedAt when undefined', async () => {
    const exec = makeExecutor()
    const repo = new ConciliationRequestRepository(exec)
    const req = ConciliationRequest.create('req-1', {
      accountId: 'acc-1', externalId: 'ext-1',
      expectedAmount: 100, currency: 'USD',
    })
    await repo.save(req)
    const [, params] = (exec.query as any).mock.calls[0]
    // senderName, idempotencyKey, lastCheckedAt → null
    expect(params[5]).toBeNull()
    expect(params[7]).toBeNull()
    expect(params[9]).toBeNull()
  })

  it('save passes through populated optional fields', async () => {
    const exec = makeExecutor()
    const repo = new ConciliationRequestRepository(exec)
    const checked = new Date('2024-01-01T00:00:00Z')
    const req = ConciliationRequest.reconstitute('req-2', {
      accountId: 'acc-1', externalId: 'ext-2',
      expectedAmount: 100, currency: 'USD',
      senderName: 'Alice', idempotencyKey: 'idem-1',
      status: 'pending', retryCount: 0,
      lastCheckedAt: checked, createdAt: new Date(),
    })
    await repo.save(req)
    const [, params] = (exec.query as any).mock.calls[0]
    expect(params[5]).toBe('Alice')
    expect(params[7]).toBe('idem-1')
    expect(params[9]).toBe(checked)
  })
})
