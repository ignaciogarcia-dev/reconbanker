import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { getTestPool, truncateAll, closeTestPool } from './helpers/testDb.js'
import { seedUser, getMiDineroBank, seedAccount } from './helpers/seed.js'

describe('integration test infra (smoke)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('connects to the test database', async () => {
    const { rows } = await getTestPool().query<{ db: string }>('SELECT current_database() AS db')
    expect(rows[0].db).toBe(process.env.DATABASE_URL!.split('/').pop()!.split('?')[0])
  })

  it('has the seeded mi-dinero bank from migrations', async () => {
    const bank = await getMiDineroBank()
    expect(bank.code).toBe('mi-dinero')
    expect(bank.id).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('seeds users and accounts', async () => {
    const user = await seedUser({ email: 'smoke@test.com' })
    const account = await seedAccount(user.id, { name: 'smoke-account' })
    expect(account.userId).toBe(user.id)
    expect(account.bank).toBe('mi-dinero')
    const { rows } = await getTestPool().query(
      'SELECT name FROM accounts WHERE id = $1', [account.id]
    )
    expect(rows[0].name).toBe('smoke-account')
  })

  it('truncates between tests (this row should not be visible to next test)', async () => {
    await seedUser({ email: 'should-be-truncated@test.com' })
    const { rows } = await getTestPool().query('SELECT COUNT(*)::int AS n FROM users')
    expect(rows[0].n).toBe(1)
  })

  it('confirms previous test was truncated', async () => {
    const { rows } = await getTestPool().query('SELECT COUNT(*)::int AS n FROM users')
    expect(rows[0].n).toBe(0)
  })
})
