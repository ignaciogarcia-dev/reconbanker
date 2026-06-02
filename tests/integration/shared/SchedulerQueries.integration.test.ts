import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import {
  SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL,
  PERSISTENT_SESSION_CANDIDATES_SQL,
} from '../../../src/shared/infrastructure/queues/schedulerQueries.js'

// These queries gate which accounts get automatic scrape triggers. They are
// tested against the real DB so the session_type / status filters can't regress.
describe('scheduler gating queries (integration)', () => {
  let userId: string

  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `sched-${crypto.randomBytes(3).toString('hex')}@test.com` })
    userId = user.id
  })
  afterAll(async () => { await closeTestPool() })

  const setConfig = async (accountId: string, sessionType: 'one-shot' | 'persistent') => {
    await getTestPool().query(
      `INSERT INTO account_config (account_id, webhook_url, session_type)
       VALUES ($1, 'https://hook.example.com', $2)`,
      [accountId, sessionType]
    )
  }
  const setInactive = async (accountId: string) => {
    await getTestPool().query(`UPDATE accounts SET status = 'inactive' WHERE id = $1`, [accountId])
  }
  const idsFrom = async (sql: string) => {
    const { rows } = await getTestPool().query<{ id: string }>(sql)
    return rows.map((r) => r.id)
  }

  it('one-shot query returns active one-shot accounts and excludes persistent / inactive', async () => {
    const oneShot = await seedAccount(userId)                 // no config → defaults to one-shot
    const oneShotExplicit = await seedAccount(userId)
    await setConfig(oneShotExplicit.id, 'one-shot')
    const persistent = await seedAccount(userId)
    await setConfig(persistent.id, 'persistent')
    const inactive = await seedAccount(userId)
    await setInactive(inactive.id)

    const ids = await idsFrom(SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL)

    expect(ids).toEqual(expect.arrayContaining([oneShot.id, oneShotExplicit.id]))
    expect(ids).not.toContain(persistent.id)
    expect(ids).not.toContain(inactive.id)
  })

  it('persistent query returns active persistent accounts and excludes one-shot / inactive', async () => {
    const persistent = await seedAccount(userId)
    await setConfig(persistent.id, 'persistent')
    const persistentInactive = await seedAccount(userId)
    await setConfig(persistentInactive.id, 'persistent')
    await setInactive(persistentInactive.id)
    const oneShot = await seedAccount(userId)                 // no config → one-shot

    const ids = await idsFrom(PERSISTENT_SESSION_CANDIDATES_SQL)

    expect(ids).toContain(persistent.id)
    expect(ids).not.toContain(persistentInactive.id)
    expect(ids).not.toContain(oneShot.id)
  })
})
