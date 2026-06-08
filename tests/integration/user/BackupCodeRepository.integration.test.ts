import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser } from '../helpers/seed.js'
import { BackupCodeRepository } from '../../../src/contexts/user/infrastructure/BackupCodeRepository.js'
import { executorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'

function makeRepo(): BackupCodeRepository {
  return new BackupCodeRepository(executorFromPool(getTestPool()))
}

describe('BackupCodeRepository (integration)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('replaceForUser inserts a batch of hashes', async () => {
    const user = await seedUser({ email: 'bc-insert@test.com' })
    const repo = makeRepo()
    await repo.replaceForUser(user.id, ['h1', 'h2', 'h3'])

    const active = await repo.listActive(user.id)
    expect(active).toHaveLength(3)
    expect(active.map((c) => c.codeHash).sort()).toEqual(['h1', 'h2', 'h3'])
    expect(active.every((c) => typeof c.id === 'string')).toBe(true)
  })

  it('replaceForUser deletes the previous batch before inserting', async () => {
    const user = await seedUser({ email: 'bc-replace@test.com' })
    const repo = makeRepo()
    await repo.replaceForUser(user.id, ['old1', 'old2'])
    await repo.replaceForUser(user.id, ['new1'])

    const active = await repo.listActive(user.id)
    expect(active.map((c) => c.codeHash)).toEqual(['new1'])
  })

  it('listActive excludes consumed codes', async () => {
    const user = await seedUser({ email: 'bc-active@test.com' })
    const repo = makeRepo()
    await repo.replaceForUser(user.id, ['a', 'b'])
    const [first] = await repo.listActive(user.id)
    await repo.markUsed(first.id)

    const active = await repo.listActive(user.id)
    expect(active).toHaveLength(1)
    expect(active[0].id).not.toBe(first.id)
  })

  it('markUsed sets used_at so the code cannot be reused', async () => {
    const user = await seedUser({ email: 'bc-used@test.com' })
    const repo = makeRepo()
    await repo.replaceForUser(user.id, ['x'])
    const [code] = await repo.listActive(user.id)
    // First consume wins; a second consume of the same code is rejected.
    expect(await repo.markUsed(code.id)).toBe(true)
    expect(await repo.markUsed(code.id)).toBe(false)

    const { rows } = await getTestPool().query<{ used_at: Date | null }>(
      'SELECT used_at FROM user_backup_codes WHERE id = $1', [code.id]
    )
    expect(rows[0].used_at).not.toBeNull()
  })

  it('deleteForUser removes all of a user\'s codes', async () => {
    const user = await seedUser({ email: 'bc-delete@test.com' })
    const repo = makeRepo()
    await repo.replaceForUser(user.id, ['a', 'b', 'c'])
    await repo.deleteForUser(user.id)
    expect(await repo.listActive(user.id)).toHaveLength(0)
  })

  it('replaceForUser with an empty array clears existing codes', async () => {
    const user = await seedUser({ email: 'bc-empty@test.com' })
    const repo = makeRepo()
    await repo.replaceForUser(user.id, ['a'])
    await repo.replaceForUser(user.id, [])
    expect(await repo.listActive(user.id)).toHaveLength(0)
  })

  it('scopes codes per user', async () => {
    const u1 = await seedUser({ email: 'bc-u1@test.com' })
    const u2 = await seedUser({ email: 'bc-u2@test.com' })
    const repo = makeRepo()
    await repo.replaceForUser(u1.id, ['u1-a'])
    await repo.replaceForUser(u2.id, ['u2-a', 'u2-b'])

    expect(await repo.listActive(u1.id)).toHaveLength(1)
    expect(await repo.listActive(u2.id)).toHaveLength(2)
  })
})
