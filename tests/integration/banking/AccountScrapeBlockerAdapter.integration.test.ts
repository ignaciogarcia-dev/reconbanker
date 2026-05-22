import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { AccountScrapeBlockerAdapter } from '../../../src/contexts/banking/infrastructure/adapters/AccountScrapeBlockerAdapter.js'
import { executorFromPool } from '../../../src/contexts/banking/infrastructure/Executor.js'

describe('AccountScrapeBlockerAdapter (integration)', () => {
  let account: SeededAccount
  let blocker: AccountScrapeBlockerAdapter

  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `asb-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    blocker = new AccountScrapeBlockerAdapter(executorFromPool(getTestPool()))
  })
  afterAll(async () => { await closeTestPool() })

  const readBlock = async (id: string) => {
    const { rows } = await getTestPool().query(
      `SELECT scrape_blocked_at, scrape_blocked_reason FROM accounts WHERE id = $1`, [id])
    return rows[0]
  }

  it('records the block reason and timestamp on first block', async () => {
    expect((await readBlock(account.id)).scrape_blocked_reason).toBeNull()

    await blocker.block(account.id, 'login_failed: usuario o contraseña incorrectos')

    const row = await readBlock(account.id)
    expect(row.scrape_blocked_reason).toBe('login_failed: usuario o contraseña incorrectos')
    expect(row.scrape_blocked_at).not.toBeNull()
  })

  it('is idempotent: a second block keeps the original root-cause reason', async () => {
    await blocker.block(account.id, 'login_failed: first reason')
    const first = await readBlock(account.id)

    await blocker.block(account.id, 'login_failed: a later, different reason')

    const after = await readBlock(account.id)
    expect(after.scrape_blocked_reason).toBe('login_failed: first reason')
    // The timestamp must not move either — the row is left untouched.
    expect(after.scrape_blocked_at).toEqual(first.scrape_blocked_at)
  })

  it('only affects the targeted account', async () => {
    const other = await seedAccount(account.userId)
    await blocker.block(account.id, 'login_failed: boom')

    expect((await readBlock(other.id)).scrape_blocked_reason).toBeNull()
  })
})
