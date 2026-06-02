import { describe, it, expect, vi } from 'vitest'
import { WebhookDeadLetterRepository } from './WebhookDeadLetterRepository.js'
import type { WebhookDeadLetterEntry } from './IWebhookDeadLetterStore.js'

function makeExecutor() {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) }
}

function entry(overrides: Partial<WebhookDeadLetterEntry> = {}): WebhookDeadLetterEntry {
  return {
    accountId: 'acc-1',
    subjectType: 'bank_transaction',
    subjectId: 'tx-1',
    url: null,
    lastStatus: 500,
    lastError: 'Webhook failed: 500',
    attempts: 12,
    ...overrides,
  }
}

describe('WebhookDeadLetterRepository', () => {
  it('upserts on the unresolved-subject conflict with all fields in order', async () => {
    const exec = makeExecutor()
    const repo = new WebhookDeadLetterRepository(exec)
    await repo.record(entry())
    const [sql, params] = exec.query.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO webhook_dead_letters/)
    expect(sql).toMatch(/ON CONFLICT \(subject_type, subject_id\) WHERE resolved_at IS NULL/)
    expect(sql).toMatch(/DO UPDATE SET/)
    expect(params).toEqual(['acc-1', 'bank_transaction', 'tx-1', null, 500, 'Webhook failed: 500', 12])
  })

  it('records a null lastStatus for transport failures', async () => {
    const exec = makeExecutor()
    const repo = new WebhookDeadLetterRepository(exec)
    await repo.record(entry({ lastStatus: null, lastError: 'ECONNREFUSED' }))
    const params = exec.query.mock.calls[0][1]
    expect(params[4]).toBeNull()
    expect(params[5]).toBe('ECONNREFUSED')
  })

  it('listUnresolved scopes by account when given and maps rows to records', async () => {
    const exec = makeExecutor()
    exec.query.mockResolvedValueOnce({
      rows: [{
        id: 'dl-1', account_id: 'acc-1', subject_type: 'bank_transaction', subject_id: 'tx-1',
        url: null, last_status: 500, last_error: 'boom', attempts: 12,
        failed_at: new Date('2026-06-01T00:00:00Z'), resolved_at: null,
      }],
      rowCount: 1,
    })
    const repo = new WebhookDeadLetterRepository(exec)
    const out = await repo.listUnresolved('acc-1')
    const [sql, params] = exec.query.mock.calls[0]
    expect(sql).toMatch(/WHERE resolved_at IS NULL AND account_id = \$1/)
    expect(params).toEqual(['acc-1'])
    expect(out[0]).toEqual({
      id: 'dl-1', accountId: 'acc-1', subjectType: 'bank_transaction', subjectId: 'tx-1',
      url: null, lastStatus: 500, lastError: 'boom', attempts: 12,
      failedAt: new Date('2026-06-01T00:00:00Z'), resolvedAt: null,
    })
  })

  it('listUnresolved without account omits the account filter', async () => {
    const exec = makeExecutor()
    const repo = new WebhookDeadLetterRepository(exec)
    await repo.listUnresolved()
    const [sql, params] = exec.query.mock.calls[0]
    expect(sql).not.toMatch(/account_id = \$1/)
    expect(params).toBeUndefined()
  })

  it('markResolved closes only the open row for the subject', async () => {
    const exec = makeExecutor()
    const repo = new WebhookDeadLetterRepository(exec)
    await repo.markResolved('conciliation_request', 'req-9')
    const [sql, params] = exec.query.mock.calls[0]
    expect(sql).toMatch(/UPDATE webhook_dead_letters/)
    expect(sql).toMatch(/SET resolved_at = now\(\)/)
    expect(sql).toMatch(/resolved_at IS NULL/)
    expect(params).toEqual(['conciliation_request', 'req-9'])
  })

  it('withTx returns a new repository bound to the given executor', async () => {
    const base = makeExecutor()
    const txExec = makeExecutor()
    const repo = new WebhookDeadLetterRepository(base)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    await txRepo.record(entry())
    expect(txExec.query).toHaveBeenCalled()
    expect(base.query).not.toHaveBeenCalled()
  })
})
