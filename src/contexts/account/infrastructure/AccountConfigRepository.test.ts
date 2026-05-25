import { describe, it, expect, vi } from 'vitest'
import { AccountConfigRepository } from './AccountConfigRepository.js'
import type { Executor } from './Executor.js'

function makeExecutor(rows: any[] = []): Executor {
  return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) }
}

describe('AccountConfigRepository.withTx', () => {
  it('returns a new repository bound to the provided executor', async () => {
    const baseExec = makeExecutor()
    const txExec = makeExecutor([{
      id: 'cfg-1', account_id: 'acc-1',
      pending_orders_endpoint: null, webhook_url: 'https://h',
      retry_limit: 3, polling_method: 'GET', polling_body: null,
      auth_type: null, auth_token: null,
      webhook_auth_type: null, webhook_auth_token: null,
      notify_on_expired: false, webhook_extra_fields: null,
      silent_ingestion: false, session_type: 'one-shot', login_mode: 'simple',
      created_at: new Date(), updated_at: new Date(),
    }])
    const repo = new AccountConfigRepository(baseExec)
    const txRepo = repo.withTx(txExec)
    expect(txRepo).not.toBe(repo)
    expect(txRepo).toBeInstanceOf(AccountConfigRepository)
    await txRepo.findByAccountId('acc-1')
    expect(txExec.query).toHaveBeenCalled()
    expect(baseExec.query).not.toHaveBeenCalled()
  })
})
