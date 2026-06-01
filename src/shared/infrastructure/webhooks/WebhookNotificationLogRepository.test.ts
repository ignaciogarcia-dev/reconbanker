import { describe, it, expect, vi } from 'vitest'
import { WebhookNotificationLogRepository } from './WebhookNotificationLogRepository.js'
import type { WebhookNotificationLogEntry } from './IWebhookNotificationLog.js'

function makeExecutor() {
  return { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) }
}

function entry(overrides: Partial<WebhookNotificationLogEntry> = {}): WebhookNotificationLogEntry {
  return {
    accountId: 'acc-1',
    subjectType: 'bank_transaction',
    subjectId: 'tx-1',
    url: 'https://hook.example.com',
    requestPayload: { id: 'tx-1', amount: 100 },
    responseStatus: 200,
    responseBody: '{"ok":true}',
    errorMessage: null,
    attempt: 1,
    ...overrides,
  }
}

describe('WebhookNotificationLogRepository', () => {
  it('inserts a row with all fields in order', async () => {
    const exec = makeExecutor()
    const repo = new WebhookNotificationLogRepository(exec)
    await repo.record(entry())
    const [sql, params] = exec.query.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO webhook_notifications/)
    expect(params).toEqual([
      'acc-1',
      'bank_transaction',
      'tx-1',
      'https://hook.example.com',
      JSON.stringify({ id: 'tx-1', amount: 100 }),
      200,
      '{"ok":true}',          // already valid JSON → passed through for ::jsonb cast
      null,
      1,
    ])
  })

  it('wraps a non-JSON response body as a JSON string node', async () => {
    const exec = makeExecutor()
    const repo = new WebhookNotificationLogRepository(exec)
    await repo.record(entry({ responseBody: 'plain text not json' }))
    const params = exec.query.mock.calls[0][1]
    expect(params[6]).toBe(JSON.stringify('plain text not json'))
  })

  it('truncates an oversized response body to bound row size', async () => {
    const exec = makeExecutor()
    const repo = new WebhookNotificationLogRepository(exec)
    const huge = 'x'.repeat(20_000)
    await repo.record(entry({ responseBody: huge }))
    const stored = JSON.parse(exec.query.mock.calls[0][1][6] as string)
    expect(typeof stored).toBe('string')
    expect(stored.length).toBeLessThanOrEqual(10_000)
  })

  it('maps null response body and null status (network error)', async () => {
    const exec = makeExecutor()
    const repo = new WebhookNotificationLogRepository(exec)
    await repo.record(entry({ responseStatus: null, responseBody: null, errorMessage: 'ECONNRESET' }))
    const params = exec.query.mock.calls[0][1]
    expect(params[5]).toBeNull()       // response_status
    expect(params[6]).toBeNull()       // response_body
    expect(params[7]).toBe('ECONNRESET')
  })

  it('withTx returns a new repository bound to the given executor', async () => {
    const base = makeExecutor()
    const txExec = makeExecutor()
    const repo = new WebhookNotificationLogRepository(base)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    await txRepo.record(entry())
    expect(txExec.query).toHaveBeenCalled()
    expect(base.query).not.toHaveBeenCalled()
  })
})
