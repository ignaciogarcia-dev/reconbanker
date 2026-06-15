import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApiKeysRouter } from './apiKeys.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import { UnauthorizedError } from '../../shared/errors/index.js'
import type { UserModule } from '../../composition/userModule.js'

type MockedUserModule = {
  listApiKeys: { execute: ReturnType<typeof vi.fn> }
  createApiKey: { execute: ReturnType<typeof vi.fn> }
  revokeApiKey: { execute: ReturnType<typeof vi.fn> }
}

function makeUserModule(): MockedUserModule {
  return {
    listApiKeys: { execute: vi.fn() },
    createApiKey: { execute: vi.fn() },
    revokeApiKey: { execute: vi.fn() },
  }
}

function makeApp(user: MockedUserModule, opts?: { protected?: boolean }) {
  return buildTestApp({
    basePath: '/me/api-keys',
    router: buildApiKeysRouter(user as unknown as UserModule),
    protected: opts?.protected ?? true,
  })
}

const sampleKey = {
  id: '5d8f1c2a-9b3e-4f6a-8c1d-2e3f4a5b6c7d',
  userId: 'user-1',
  name: 'CI key',
  prefix: 'abcd1234',
  scopes: ['otp:write'],
  accountIds: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastUsedAt: null,
  revokedAt: null,
}

const sampleJson = {
  id: sampleKey.id,
  name: 'CI key',
  prefix: 'abcd1234',
  scopes: ['otp:write'],
  account_ids: null,
  created_at: '2026-01-01T00:00:00.000Z',
  last_used_at: null,
  revoked_at: null,
}

describe('apiKeys.routes', () => {
  let user: MockedUserModule

  beforeEach(() => {
    user = makeUserModule()
  })

  describe('GET /me/api-keys', () => {
    it('returns the keys and the available scopes', async () => {
      user.listApiKeys.execute.mockResolvedValue([sampleKey])

      const res = await request(makeApp(user))
        .get('/me/api-keys')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        keys: [sampleJson],
        available_scopes: ['otp:write', 'status:read'],
      })
      expect(user.listApiKeys.execute).toHaveBeenCalledWith('user-1')
    })

    it('returns 401 when the request is not authenticated', async () => {
      const res = await request(makeApp(user, { protected: false })).get('/me/api-keys')

      expect(res.status).toBe(401)
      expect(user.listApiKeys.execute).not.toHaveBeenCalled()
    })
  })

  describe('POST /me/api-keys', () => {
    it('creates a key and returns the plaintext secret once', async () => {
      user.createApiKey.execute.mockResolvedValue({
        apiKey: sampleKey,
        plaintext: 'rbk_abcd1234_secret',
      })

      const res = await request(makeApp(user))
        .post('/me/api-keys')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'CI key', scopes: ['otp:write'] })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ ...sampleJson, key: 'rbk_abcd1234_secret' })
      expect(user.createApiKey.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        name: 'CI key',
        scopes: ['otp:write'],
        accountIds: null,
      })
    })

    it('forwards account_ids when provided', async () => {
      user.createApiKey.execute.mockResolvedValue({ apiKey: sampleKey, plaintext: 'rbk_x_y' })
      const accountId = '7e9a2b3c-4d5e-4f6a-9b8c-1d2e3f4a5b6c'

      const res = await request(makeApp(user))
        .post('/me/api-keys')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'scoped', scopes: ['status:read'], account_ids: [accountId] })

      expect(res.status).toBe(201)
      expect(user.createApiKey.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        name: 'scoped',
        scopes: ['status:read'],
        accountIds: [accountId],
      })
    })

    it('returns 400 for an unknown scope', async () => {
      const res = await request(makeApp(user))
        .post('/me/api-keys')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'bad', scopes: ['admin:all'] })

      expect(res.status).toBe(400)
      expect(user.createApiKey.execute).not.toHaveBeenCalled()
    })

    it('returns 400 when scopes are empty', async () => {
      const res = await request(makeApp(user))
        .post('/me/api-keys')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'bad', scopes: [] })

      expect(res.status).toBe(400)
    })

    it('returns 401 when the request is not authenticated', async () => {
      const res = await request(makeApp(user, { protected: false }))
        .post('/me/api-keys')
        .send({ name: 'CI key', scopes: ['otp:write'] })

      expect(res.status).toBe(401)
      expect(user.createApiKey.execute).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /me/api-keys/:id', () => {
    const id = '5d8f1c2a-9b3e-4f6a-8c1d-2e3f4a5b6c7d'

    it('returns 204 when the key is revoked', async () => {
      user.revokeApiKey.execute.mockResolvedValue(true)

      const res = await request(makeApp(user))
        .delete(`/me/api-keys/${id}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(204)
      expect(user.revokeApiKey.execute).toHaveBeenCalledWith(id, 'user-1', undefined)
    })

    it('forwards a 2FA code from the body to the use case', async () => {
      user.revokeApiKey.execute.mockResolvedValue(true)

      const res = await request(makeApp(user))
        .delete(`/me/api-keys/${id}`)
        .set('Authorization', AUTH_HEADER)
        .send({ code: '123456' })

      expect(res.status).toBe(204)
      expect(user.revokeApiKey.execute).toHaveBeenCalledWith(id, 'user-1', '123456')
    })

    it('propagates a 401 when the use case rejects the code', async () => {
      user.revokeApiKey.execute.mockRejectedValue(new UnauthorizedError('Invalid code'))

      const res = await request(makeApp(user))
        .delete(`/me/api-keys/${id}`)
        .set('Authorization', AUTH_HEADER)
        .send({ code: '000000' })

      expect(res.status).toBe(401)
    })

    it('returns 404 when the key does not exist for the user', async () => {
      user.revokeApiKey.execute.mockResolvedValue(false)

      const res = await request(makeApp(user))
        .delete(`/me/api-keys/${id}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(404)
    })

    it('returns 400 for a non-uuid id', async () => {
      const res = await request(makeApp(user))
        .delete('/me/api-keys/not-a-uuid')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(user.revokeApiKey.execute).not.toHaveBeenCalled()
    })
  })
})
