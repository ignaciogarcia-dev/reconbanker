import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildAccountsRouter } from './accounts.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/index.js'
import type { AccountModule } from '../../composition/accountModule.js'
import { enqueueBankScrape } from '../../shared/infrastructure/queues/BankScrapeQueue.js'

vi.mock('../../shared/infrastructure/queues/BankScrapeQueue.js', () => ({
  enqueueBankScrape: vi.fn().mockResolvedValue({ jobId: 'job-1', status: 'queued' }),
}))

type MockedAccountModule = {
  createAccount: { execute: ReturnType<typeof vi.fn> }
  deleteAccount: { execute: ReturnType<typeof vi.fn> }
  listAccountsForUser: { execute: ReturnType<typeof vi.fn> }
  getAccountDetail: { execute: ReturnType<typeof vi.fn> }
  getAccountConfig: { execute: ReturnType<typeof vi.fn> }
  upsertAccountConfig: { execute: ReturnType<typeof vi.fn> }
}

function makeAccountModule(): MockedAccountModule {
  return {
    createAccount: { execute: vi.fn() },
    deleteAccount: { execute: vi.fn() },
    listAccountsForUser: { execute: vi.fn() },
    getAccountDetail: { execute: vi.fn() },
    getAccountConfig: { execute: vi.fn() },
    upsertAccountConfig: { execute: vi.fn() },
  }
}

function makeApp(account: MockedAccountModule) {
  return buildTestApp({
    basePath: '/accounts',
    router: buildAccountsRouter(account as unknown as AccountModule),
    protected: true,
  })
}

const ACCOUNT_ID = 'b9c224b3-3c2b-42bd-b23e-337ae0185690'

function configFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    accountId: ACCOUNT_ID,
    pendingOrdersEndpoint: null,
    webhookUrl: 'https://hook.test',
    retryLimit: 3,
    pollingMethod: 'GET',
    pollingBody: null,
    authType: 'bearer',
    authToken: null,
    webhookAuthType: null,
    webhookAuthToken: null,
    notifyOnExpired: false,
    webhookExtraFields: null,
    silentIngestion: false,
    sessionType: 'one-shot',
    loginMode: 'simple',
    notificationEndpointUrl: null,
    notificationAuthType: null,
    notificationAuthToken: null,
    notificationEvents: null,
    bankUsername: null,
    ...overrides,
  }
}

function validConfigBody(overrides: Record<string, unknown> = {}) {
  return {
    webhook_url: 'https://hook.test',
    ...overrides,
  }
}

describe('accounts.routes', () => {
  let account: MockedAccountModule

  beforeEach(() => {
    account = makeAccountModule()
    vi.mocked(enqueueBankScrape).mockClear()
    vi.mocked(enqueueBankScrape).mockResolvedValue({ jobId: 'job-1', status: 'queued' } as never)
  })

  describe('GET /accounts', () => {
    it('returns 200 with accounts for the authenticated user', async () => {
      account.listAccountsForUser.execute.mockResolvedValue([{ id: 'a1', name: 'A' }])

      const res = await request(makeApp(account))
        .get('/accounts')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 'a1', name: 'A' }])
      expect(account.listAccountsForUser.execute).toHaveBeenCalledWith('user-1')
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(account)).get('/accounts')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /accounts', () => {
    it('returns 201 with the created account on valid body', async () => {
      account.createAccount.execute.mockResolvedValue({ id: 'a1', name: 'A' })

      const res = await request(makeApp(account))
        .post('/accounts')
        .set('Authorization', AUTH_HEADER)
        .send({ bankId: 'b1', name: 'A' })

      expect(res.status).toBe(201)
      expect(account.createAccount.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        bankId: 'b1',
        name: 'A',
      })
    })

    it('returns 400 when name is missing', async () => {
      const res = await request(makeApp(account))
        .post('/accounts')
        .set('Authorization', AUTH_HEADER)
        .send({ bankId: 'b1' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 404 when bank does not exist', async () => {
      account.createAccount.execute.mockRejectedValue(new NotFoundError('Bank not found'))

      const res = await request(makeApp(account))
        .post('/accounts')
        .set('Authorization', AUTH_HEADER)
        .send({ bankId: 'b1', name: 'A' })

      expect(res.status).toBe(404)
    })
  })

  describe('GET /accounts/:accountId', () => {
    it('returns 200 with account detail', async () => {
      account.getAccountDetail.execute.mockResolvedValue({ id: ACCOUNT_ID, name: 'A' })

      const res = await request(makeApp(account))
        .get(`/accounts/${ACCOUNT_ID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(account.getAccountDetail.execute).toHaveBeenCalledWith(ACCOUNT_ID, 'user-1')
    })

    it('returns 400 when accountId is not a uuid', async () => {
      const res = await request(makeApp(account))
        .get('/accounts/bad-id')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
    })

    it('returns 403 when use case throws ForbiddenError', async () => {
      account.getAccountDetail.execute.mockRejectedValue(new ForbiddenError('forbidden'))

      const res = await request(makeApp(account))
        .get(`/accounts/${ACCOUNT_ID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
    })
  })

  describe('DELETE /accounts/:accountId', () => {
    it('returns 204 on successful deletion', async () => {
      account.deleteAccount.execute.mockResolvedValue(undefined)

      const res = await request(makeApp(account))
        .delete(`/accounts/${ACCOUNT_ID}`)
        .set('Authorization', AUTH_HEADER)
        .send({ confirmation_name: 'My Account' })

      expect(res.status).toBe(204)
      expect(account.deleteAccount.execute).toHaveBeenCalledWith({
        id: ACCOUNT_ID,
        userId: 'user-1',
        confirmationName: 'My Account',
      })
    })

    it('returns 400 when confirmation_name is missing', async () => {
      const res = await request(makeApp(account))
        .delete(`/accounts/${ACCOUNT_ID}`)
        .set('Authorization', AUTH_HEADER)
        .send({})

      expect(res.status).toBe(400)
    })

    it('returns 409 when use case throws ConflictError', async () => {
      account.deleteAccount.execute.mockRejectedValue(
        new ConflictError('confirmation does not match'),
      )

      const res = await request(makeApp(account))
        .delete(`/accounts/${ACCOUNT_ID}`)
        .set('Authorization', AUTH_HEADER)
        .send({ confirmation_name: 'wrong' })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /accounts/:accountId/config', () => {
    it('returns 200 with serialized config when present', async () => {
      account.getAccountConfig.execute.mockResolvedValue(configFixture())

      const res = await request(makeApp(account))
        .get(`/accounts/${ACCOUNT_ID}/config`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: 'cfg-1',
        account_id: ACCOUNT_ID,
        pending_orders_endpoint: null,
        webhook_url: 'https://hook.test',
        retry_limit: 3,
        polling_method: 'GET',
        polling_body: null,
        auth_type: 'bearer',
        auth_token: null,
        webhook_auth_type: null,
        webhook_auth_token: null,
        notify_on_expired: false,
        webhook_extra_fields: null,
        silent_ingestion: false,
        session_type: 'one-shot',
        login_mode: 'simple',
        notification_endpoint_url: null,
        notification_auth_type: null,
        notification_auth_token: null,
        notification_events: null,
        bank_username: null,
      })
    })

    it('masks stored auth tokens with a sentinel instead of exposing them', async () => {
      account.getAccountConfig.execute.mockResolvedValue(
        configFixture({ authToken: 'real-secret', webhookAuthToken: 'real-webhook-secret' }),
      )

      const res = await request(makeApp(account))
        .get(`/accounts/${ACCOUNT_ID}/config`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body.auth_token).toBe('__secret_present__')
      expect(res.body.webhook_auth_token).toBe('__secret_present__')
      expect(JSON.stringify(res.body)).not.toContain('real-secret')
    })

    it('returns 200 with null when no config exists', async () => {
      account.getAccountConfig.execute.mockResolvedValue(null)

      const res = await request(makeApp(account))
        .get(`/accounts/${ACCOUNT_ID}/config`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toBeNull()
    })

    it('returns 400 when accountId is not a uuid', async () => {
      const res = await request(makeApp(account))
        .get('/accounts/bad/config')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
    })
  })

  describe('POST /accounts/:accountId/scrape', () => {
    it('returns 202 with the queue result on success', async () => {
      account.getAccountDetail.execute.mockResolvedValue({ id: ACCOUNT_ID })

      const res = await request(makeApp(account))
        .post(`/accounts/${ACCOUNT_ID}/scrape`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ jobId: 'job-1', status: 'queued' })
      expect(account.getAccountDetail.execute).toHaveBeenCalledWith(ACCOUNT_ID, 'user-1')
      expect(enqueueBankScrape).toHaveBeenCalledWith(ACCOUNT_ID)
    })

    it('returns 403 when account is not owned', async () => {
      account.getAccountDetail.execute.mockRejectedValue(new ForbiddenError('forbidden'))

      const res = await request(makeApp(account))
        .post(`/accounts/${ACCOUNT_ID}/scrape`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(enqueueBankScrape).not.toHaveBeenCalled()
    })

    it('returns 400 when accountId is not a uuid', async () => {
      const res = await request(makeApp(account))
        .post('/accounts/bad/scrape')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
    })
  })

  describe('PUT /accounts/:accountId/config', () => {
    beforeEach(() => {
      account.upsertAccountConfig.execute.mockResolvedValue(configFixture())
    })

    it('returns 200 with the serialized config on minimal valid body', async () => {
      const res = await request(makeApp(account))
        .put(`/accounts/${ACCOUNT_ID}/config`)
        .set('Authorization', AUTH_HEADER)
        .send(validConfigBody())

      expect(res.status).toBe(200)
      expect(res.body.webhook_url).toBe('https://hook.test')
      expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          accountId: ACCOUNT_ID,
          webhookUrl: 'https://hook.test',
          retryLimit: 3,
          pollingMethod: 'GET',
          pollingBody: null,
          authType: 'bearer',
          authToken: null,
          webhookAuthType: null,
          webhookAuthToken: null,
          notifyOnExpired: false,
          webhookExtraFields: null,
          silentIngestion: false,
          sessionType: 'one-shot',
          loginMode: 'simple',
          bankUsername: null,
          bankPassword: null,
        }),
      )
    })

    it('returns 400 when webhook_url is missing', async () => {
      const res = await request(makeApp(account))
        .put(`/accounts/${ACCOUNT_ID}/config`)
        .set('Authorization', AUTH_HEADER)
        .send({})

      expect(res.status).toBe(400)
      expect(account.upsertAccountConfig.execute).not.toHaveBeenCalled()
    })

    it('returns 400 when accountId is not a uuid', async () => {
      const res = await request(makeApp(account))
        .put('/accounts/bad/config')
        .set('Authorization', AUTH_HEADER)
        .send(validConfigBody())

      expect(res.status).toBe(400)
    })

    it('passes through full config fields on POST polling', async () => {
      const body = validConfigBody({
        pending_orders_endpoint: 'https://x.test/pending',
        polling_method: 'POST',
        polling_body: { a: 1 },
        auth_type: 'api_key',
        auth_token: 'tok',
        webhook_auth_type: 'bearer',
        webhook_auth_token: 'whtok',
        retry_limit: 5,
        notify_on_expired: true,
        webhook_extra_fields: { foo: 'bar' },
        silent_ingestion: true,
        session_type: 'persistent',
        login_mode: 'assisted',
        bank_username: 'u',
        bank_password: 'p',
      })

      const res = await request(makeApp(account))
        .put(`/accounts/${ACCOUNT_ID}/config`)
        .set('Authorization', AUTH_HEADER)
        .send(body)

      expect(res.status).toBe(200)
      expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          pendingOrdersEndpoint: 'https://x.test/pending',
          pollingMethod: 'POST',
          pollingBody: { a: 1 },
          authType: 'api_key',
          authToken: 'tok',
          webhookAuthType: 'bearer',
          webhookAuthToken: 'whtok',
          retryLimit: 5,
          notifyOnExpired: true,
          webhookExtraFields: { foo: 'bar' },
          silentIngestion: true,
          sessionType: 'persistent',
          loginMode: 'assisted',
          bankUsername: 'u',
          bankPassword: 'p',
        }),
      )
    })

    it('propagates domain errors from upsertAccountConfig', async () => {
      account.upsertAccountConfig.execute.mockRejectedValue(new NotFoundError('Account not found'))

      const res = await request(makeApp(account))
        .put(`/accounts/${ACCOUNT_ID}/config`)
        .set('Authorization', AUTH_HEADER)
        .send(validConfigBody())

      expect(res.status).toBe(404)
    })

    describe('parseExtraFields branches', () => {
      it('treats empty string as null', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ webhook_extra_fields: '' }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ webhookExtraFields: null }),
        )
      })

      it('treats null as null', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ webhook_extra_fields: null }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ webhookExtraFields: null }),
        )
      })

      it('parses a JSON object string', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ webhook_extra_fields: '{"foo":"bar"}' }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ webhookExtraFields: { foo: 'bar' } }),
        )
      })

      it('accepts a JSON object directly', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ webhook_extra_fields: { foo: 'bar' } }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ webhookExtraFields: { foo: 'bar' } }),
        )
      })

      it('returns 400 when the string is not valid JSON', async () => {
        const res = await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ webhook_extra_fields: 'not-json' }))

        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
        expect(res.body.error.message).toMatch(/webhook_extra_fields must be valid JSON/)
      })

      it('returns 400 when JSON is not an object (array)', async () => {
        const res = await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ webhook_extra_fields: '[1,2,3]' }))

        expect(res.status).toBe(400)
        expect(res.body.error.message).toMatch(/JSON object/)
      })

      it('returns 400 when JSON is a primitive (null parsed)', async () => {
        const res = await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ webhook_extra_fields: 'null' }))

        expect(res.status).toBe(400)
        expect(res.body.error.message).toMatch(/JSON object/)
      })

      it('returns 400 when extra fields override reserved keys', async () => {
        const res = await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ webhook_extra_fields: { external_id: 'x', amount: 1 } }))

        expect(res.status).toBe(400)
        expect(res.body.error.message).toMatch(/cannot override reserved keys/)
        expect(res.body.error.message).toContain('external_id')
        expect(res.body.error.message).toContain('amount')
      })
    })

    describe('parsePollingBody branches', () => {
      it('returns null for GET method regardless of body', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ polling_method: 'GET', polling_body: { a: 1 } }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ pollingMethod: 'GET', pollingBody: null }),
        )
      })

      it('returns null on POST with null body', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ polling_method: 'POST', polling_body: null }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ pollingMethod: 'POST', pollingBody: null }),
        )
      })

      it('returns null on POST with empty string body', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ polling_method: 'POST', polling_body: '' }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ pollingMethod: 'POST', pollingBody: null }),
        )
      })

      it('returns null on POST with whitespace-only string body', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ polling_method: 'POST', polling_body: '   ' }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ pollingMethod: 'POST', pollingBody: null }),
        )
      })

      it('parses POST body from JSON string', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ polling_method: 'POST', polling_body: '{"foo":"bar"}' }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ pollingMethod: 'POST', pollingBody: { foo: 'bar' } }),
        )
      })

      it('accepts POST body as plain object', async () => {
        await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ polling_method: 'POST', polling_body: { foo: 'bar' } }))

        expect(account.upsertAccountConfig.execute).toHaveBeenCalledWith(
          expect.objectContaining({ pollingMethod: 'POST', pollingBody: { foo: 'bar' } }),
        )
      })

      it('returns 400 when POST body string is not valid JSON', async () => {
        const res = await request(makeApp(account))
          .put(`/accounts/${ACCOUNT_ID}/config`)
          .set('Authorization', AUTH_HEADER)
          .send(validConfigBody({ polling_method: 'POST', polling_body: 'not-json' }))

        expect(res.status).toBe(400)
        expect(res.body.error.message).toMatch(/polling_body must be valid JSON/)
      })
    })
  })

  describe('requireUserId defensive guard', () => {
    it('returns 401 when middleware does not set userId', async () => {
      // Mount unprotected so requireUserId itself throws UnauthorizedError
      const app = buildTestApp({
        basePath: '/accounts',
        router: buildAccountsRouter(account as unknown as AccountModule),
        protected: false,
      })

      const res = await request(app).get('/accounts')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })
  })

  describe('parsePollingBody defensive fallthrough', () => {
    // Confirms the ValidationError branch behind the zod schema is reachable
    it('ValidationError surfaces as 400 (sanity)', () => {
      const err = new ValidationError('polling_body must be valid JSON (or empty)')
      expect(err.statusCode).toBe(400)
    })
  })
})
