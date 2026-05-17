import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { ScrapeRunRepository } from '../../../src/contexts/banking/infrastructure/ScrapeRunRepository.js'
import { executorFromPool } from '../../../src/contexts/banking/infrastructure/Executor.js'

let account: SeededAccount
let scriptId: string
let repo: ScrapeRunRepository

async function getActiveScriptId(): Promise<string> {
  const { rows } = await getTestPool().query(
    `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active' LIMIT 1`
  )
  return rows[0].id
}

describe('ScrapeRunRepository (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `srr-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    scriptId = await getActiveScriptId()
    repo = new ScrapeRunRepository(executorFromPool(getTestPool()))
  })
  afterAll(async () => { await closeTestPool() })

  it('create persists a row with status running', async () => {
    const runId = crypto.randomUUID()
    await repo.create(runId, account.id, scriptId)
    const { rows } = await getTestPool().query('SELECT * FROM bank_scrape_runs WHERE id=$1', [runId])
    expect(rows[0].status).toBe('running')
    expect(rows[0].account_id).toBe(account.id)
    expect(rows[0].script_id).toBe(scriptId)
    expect(rows[0].started_at).toBeInstanceOf(Date)
    expect(rows[0].finished_at).toBeNull()
  })

  it('markSuccess sets status=success and transactions_found', async () => {
    const runId = crypto.randomUUID()
    await repo.create(runId, account.id, scriptId)
    await repo.markSuccess(runId, 7)
    const { rows } = await getTestPool().query('SELECT * FROM bank_scrape_runs WHERE id=$1', [runId])
    expect(rows[0].status).toBe('success')
    expect(rows[0].transactions_found).toBe(7)
    expect(rows[0].finished_at).toBeInstanceOf(Date)
  })

  it('markFailed sets status=failed, failure_type and error_message', async () => {
    const runId = crypto.randomUUID()
    await repo.create(runId, account.id, scriptId)
    await repo.markFailed(runId, 'boom')
    const { rows } = await getTestPool().query('SELECT * FROM bank_scrape_runs WHERE id=$1', [runId])
    expect(rows[0].status).toBe('failed')
    expect(rows[0].error_message).toBe('boom')
    expect(rows[0].failure_type).toBe('unknown')
    expect(rows[0].finished_at).toBeInstanceOf(Date)
  })
})
