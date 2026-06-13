import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser } from '../helpers/seed.js'
import { ApiKeyRepository } from '../../../src/contexts/user/infrastructure/ApiKeyRepository.js'
import { executorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'
import type { CreateApiKeyInput } from '../../../src/contexts/user/domain/IApiKeyRepository.js'

function makeRepo(): ApiKeyRepository {
  return new ApiKeyRepository(executorFromPool(getTestPool()))
}

function input(userId: string, overrides: Partial<CreateApiKeyInput> = {}): CreateApiKeyInput {
  return {
    userId,
    name: 'CI key',
    prefix: 'abcd1234',
    hash: 'a'.repeat(64),
    scopes: ['otp:write'],
    accountIds: null,
    ...overrides,
  }
}

describe('ApiKeyRepository (integration)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('create persists and returns the key with defaults', async () => {
    const user = await seedUser({ email: 'ak-create@test.com' })
    const repo = makeRepo()

    const key = await repo.create(input(user.id))

    expect(key.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(key.userId).toBe(user.id)
    expect(key.name).toBe('CI key')
    expect(key.prefix).toBe('abcd1234')
    expect(key.scopes).toEqual(['otp:write'])
    expect(key.accountIds).toBeNull()
    expect(key.createdAt).toBeInstanceOf(Date)
    expect(key.lastUsedAt).toBeNull()
    expect(key.revokedAt).toBeNull()
  })

  it('create stores account_ids when restricted', async () => {
    const user = await seedUser({ email: 'ak-accounts@test.com' })
    const repo = makeRepo()
    const accountId = crypto.randomUUID()

    const key = await repo.create(input(user.id, { accountIds: [accountId] }))

    expect(key.accountIds).toEqual([accountId])
  })

  it('listByUser returns only the user keys, newest first', async () => {
    const alice = await seedUser({ email: 'ak-alice@test.com' })
    const bob = await seedUser({ email: 'ak-bob@test.com' })
    const repo = makeRepo()
    await repo.create(input(alice.id, { name: 'first', prefix: 'aaaa0001' }))
    await getTestPool().query(`UPDATE api_keys SET created_at = created_at - interval '1 hour'`)
    await repo.create(input(alice.id, { name: 'second', prefix: 'aaaa0002' }))
    await repo.create(input(bob.id, { name: 'bobs', prefix: 'bbbb0001' }))

    const keys = await repo.listByUser(alice.id)

    expect(keys.map((k) => k.name)).toEqual(['second', 'first'])
  })

  it('findActiveByPrefix returns the key with its hash and skips revoked keys', async () => {
    const user = await seedUser({ email: 'ak-find@test.com' })
    const repo = makeRepo()
    const created = await repo.create(input(user.id))

    const found = await repo.findActiveByPrefix('abcd1234')
    expect(found?.id).toBe(created.id)
    expect(found?.hash).toBe('a'.repeat(64))

    await repo.revoke(created.id, user.id)
    expect(await repo.findActiveByPrefix('abcd1234')).toBeNull()
  })

  it('findActiveByPrefix returns null for an unknown prefix', async () => {
    expect(await makeRepo().findActiveByPrefix('ffffffff')).toBeNull()
  })

  it('revoke marks the key and is idempotent and user-scoped', async () => {
    const user = await seedUser({ email: 'ak-revoke@test.com' })
    const other = await seedUser({ email: 'ak-other@test.com' })
    const repo = makeRepo()
    const created = await repo.create(input(user.id))

    // Another user cannot revoke it
    expect(await repo.revoke(created.id, other.id)).toBe(false)
    expect(await repo.revoke(created.id, user.id)).toBe(true)
    // Already revoked
    expect(await repo.revoke(created.id, user.id)).toBe(false)

    const [key] = await repo.listByUser(user.id)
    expect(key.revokedAt).toBeInstanceOf(Date)
  })

  it('touchLastUsed stamps last_used_at', async () => {
    const user = await seedUser({ email: 'ak-touch@test.com' })
    const repo = makeRepo()
    const created = await repo.create(input(user.id))

    await repo.touchLastUsed(created.id)

    const [key] = await repo.listByUser(user.id)
    expect(key.lastUsedAt).toBeInstanceOf(Date)
  })
})
