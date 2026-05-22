import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { AccountConfigRepository } from '../../../src/contexts/account/infrastructure/AccountConfigRepository.js'
import { executorFromPool } from '../../../src/contexts/account/infrastructure/Executor.js'
import type { AccountConfigInput } from '../../../src/contexts/account/domain/AccountConfig.js'

describe('AccountConfigRepository (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  function makeRepo() {
    return new AccountConfigRepository(executorFromPool(getTestPool()))
  }

  function buildInput(accountId: string, overrides: Partial<AccountConfigInput> = {}): AccountConfigInput {
    return {
      accountId,
      pendingOrdersEndpoint: 'https://example.com/orders',
      webhookUrl: 'https://hook.example.com',
      retryLimit: 5,
      pollingMethod: 'POST',
      pollingBody: { foo: 'bar', n: 1 },
      authType: 'bearer',
      authToken: 'tok-123',
      webhookAuthType: 'api_key',
      webhookAuthToken: 'wh-tok',
      notifyOnExpired: true,
      webhookExtraFields: { custom: { nested: true }, list: [1, 2, 3] },
      silentIngestion: true,
      sessionType: 'one-shot',
      loginMode: 'simple',
      ...overrides,
    }
  }

  describe('findByAccountId', () => {
    it('returns null when no config exists', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      const found = await repo.findByAccountId(acc.id)
      expect(found).toBeNull()
    })

    it('returns the existing config', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert(buildInput(acc.id))

      const found = await repo.findByAccountId(acc.id)
      expect(found?.accountId).toBe(acc.id)
      expect(found?.webhookUrl).toBe('https://hook.example.com')
    })
  })

  describe('upsert', () => {
    it('inserts a new config and returns all fields correctly', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      const input = buildInput(acc.id)
      const result = await repo.upsert(input)

      expect(result.id).toMatch(/^[0-9a-f-]{36}$/i)
      expect(result.accountId).toBe(acc.id)
      expect(result.pendingOrdersEndpoint).toBe(input.pendingOrdersEndpoint)
      expect(result.webhookUrl).toBe(input.webhookUrl)
      expect(result.retryLimit).toBe(5)
      expect(result.pollingMethod).toBe('POST')
      expect(result.pollingBody).toEqual({ foo: 'bar', n: 1 })
      expect(result.authType).toBe('bearer')
      expect(result.authToken).toBe('tok-123')
      expect(result.webhookAuthType).toBe('api_key')
      expect(result.webhookAuthToken).toBe('wh-tok')
      expect(result.notifyOnExpired).toBe(true)
      expect(result.webhookExtraFields).toEqual({ custom: { nested: true }, list: [1, 2, 3] })
      expect(result.silentIngestion).toBe(true)
    })

    it('updates on conflict (account_id) preserving id and updating fields', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      const first = await repo.upsert(buildInput(acc.id))

      const second = await repo.upsert(buildInput(acc.id, {
        retryLimit: 10,
        pollingMethod: 'GET',
        pollingBody: null,
        webhookExtraFields: { changed: true },
        silentIngestion: false,
        pendingOrdersEndpoint: null,
      }))

      expect(second.id).toBe(first.id)
      expect(second.retryLimit).toBe(10)
      expect(second.pollingMethod).toBe('GET')
      expect(second.pollingBody).toBeNull()
      expect(second.webhookExtraFields).toEqual({ changed: true })
      expect(second.silentIngestion).toBe(false)
      expect(second.pendingOrdersEndpoint).toBeNull()

      const { rows } = await getTestPool().query(
        'SELECT COUNT(*)::int AS n FROM account_config WHERE account_id = $1', [acc.id]
      )
      expect(rows[0].n).toBe(1)
    })

    it('persists JSONB fields as queryable JSON in the database', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert(buildInput(acc.id, {
        webhookExtraFields: { marker: 'unique-value' },
      }))

      const { rows } = await getTestPool().query(
        `SELECT webhook_extra_fields ->> 'marker' AS marker FROM account_config WHERE account_id = $1`,
        [acc.id]
      )
      expect(rows[0].marker).toBe('unique-value')
    })
  })
})
