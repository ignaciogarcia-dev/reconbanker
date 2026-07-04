import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { ScrapeFailureAlertRepository } from '../../../src/contexts/banking/infrastructure/ScrapeFailureAlertRepository.js'
import { executorFromPool } from '../../../src/contexts/banking/infrastructure/Executor.js'

describe('ScrapeFailureAlertRepository (integration)', () => {
  let account: SeededAccount
  let repo: ScrapeFailureAlertRepository

  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `sfa-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    repo = new ScrapeFailureAlertRepository(executorFromPool(getTestPool()))
  })
  afterAll(async () => { await closeTestPool() })

  it('increments the streak on consecutive failures for a group', async () => {
    expect(await repo.recordFailure(account.id, 'connection')).toEqual({ streak: 1, alerted: false })
    expect(await repo.recordFailure(account.id, 'connection')).toEqual({ streak: 2, alerted: false })
    const third = await repo.recordFailure(account.id, 'connection')
    expect(third.streak).toBe(3)
    expect(third.alerted).toBe(false)
  })

  it('tracks the connection and scrape groups independently', async () => {
    await repo.recordFailure(account.id, 'connection')
    await repo.recordFailure(account.id, 'connection')
    const scrapeFirst = await repo.recordFailure(account.id, 'scrape')
    expect(scrapeFirst.streak).toBe(1)
    const connectionThird = await repo.recordFailure(account.id, 'connection')
    expect(connectionThird.streak).toBe(3)
  })

  it('markAlerted flips alerted true so a later failure in the same streak reports it', async () => {
    await repo.recordFailure(account.id, 'connection')
    await repo.markAlerted(account.id, 'connection')
    const next = await repo.recordFailure(account.id, 'connection')
    expect(next).toEqual({ streak: 2, alerted: true })
  })

  it('clear resets the streak and reports whether it had alerted', async () => {
    await repo.recordFailure(account.id, 'connection')
    await repo.markAlerted(account.id, 'connection')
    expect(await repo.clear(account.id, 'connection')).toEqual({ wasAlerted: true })
    // After clear the row is reset (streak 0, not alerted), so a new failure starts a fresh streak.
    expect(await repo.recordFailure(account.id, 'connection')).toEqual({ streak: 1, alerted: false })
  })

  it('clear on a group that never failed reports wasAlerted false', async () => {
    expect(await repo.clear(account.id, 'scrape')).toEqual({ wasAlerted: false })
  })
})
