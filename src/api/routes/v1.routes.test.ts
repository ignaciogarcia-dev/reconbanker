import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { buildV1Router } from './v1.routes.js'
import { errorMiddleware } from '../middlewares/error.middleware.js'
import type { ApiKeyPrincipal } from '../../contexts/user/domain/ApiKey.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { UserModule } from '../../composition/userModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

const ACCOUNT_ID = 'b9c224b3-3c2b-42bd-b23e-337ae0185690'

function principal(overrides: Partial<ApiKeyPrincipal> = {}): ApiKeyPrincipal {
  return { keyId: 'k-1', userId: 'u-1', scopes: ['otp:write', 'status:read'], accountIds: null, ...overrides }
}

type Mocks = {
  authenticate: ReturnType<typeof vi.fn>
  submit: ReturnType<typeof vi.fn>
  findPending: ReturnType<typeof vi.fn>
  isRunning: ReturnType<typeof vi.fn>
  findByIdForUser: ReturnType<typeof vi.fn>
}

function makeApp(): { app: express.Express; m: Mocks } {
  const m: Mocks = {
    authenticate: vi.fn().mockResolvedValue(principal()),
    submit: vi.fn().mockResolvedValue(undefined),
    findPending: vi.fn().mockResolvedValue(null),
    isRunning: vi.fn().mockReturnValue(false),
    findByIdForUser: vi.fn().mockResolvedValue({ id: ACCOUNT_ID }),
  }
  const deps = {
    user: { authenticateApiKey: { execute: m.authenticate } },
    banking: {
      submitAssistanceCode: { execute: m.submit },
      assistanceRepo: { findPending: m.findPending },
      sessionManager: { isRunning: m.isRunning },
    },
    accountRepo: { findByIdForUser: m.findByIdForUser },
  }
  const app = express()
  app.use(express.json())
  app.use('/v1', buildV1Router(deps as unknown as { user: UserModule; banking: BankingModule; accountRepo: IAccountRepository }))
  app.use(errorMiddleware)
  return { app, m }
}

const KEY = 'rbk_abcd1234_secret'

describe('v1.routes', () => {
  let app: express.Express
  let m: Mocks
  beforeEach(() => { ({ app, m } = makeApp()) })

  describe('POST /v1/accounts/:accountId/otp', () => {
    it('submits the code with a valid key and scope', async () => {
      const res = await request(app)
        .post(`/v1/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', `Api-Key ${KEY}`)
        .send({ code: '123456' })

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ submitted: true })
      expect(m.submit).toHaveBeenCalledWith(ACCOUNT_ID, '123456')
    })

    it('accepts the x-api-key header too', async () => {
      const res = await request(app)
        .post(`/v1/accounts/${ACCOUNT_ID}/otp`)
        .set('x-api-key', KEY)
        .send({ code: '123456' })
      expect(res.status).toBe(202)
    })

    it('returns 401 without an API key', async () => {
      const res = await request(app).post(`/v1/accounts/${ACCOUNT_ID}/otp`).send({ code: '123456' })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('returns 401 when the key is invalid', async () => {
      m.authenticate.mockResolvedValue(null)
      const res = await request(app)
        .post(`/v1/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', `Api-Key ${KEY}`)
        .send({ code: '123456' })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_API_KEY')
    })

    it('returns 403 when the key lacks the otp:write scope', async () => {
      m.authenticate.mockResolvedValue(principal({ scopes: ['status:read'] }))
      const res = await request(app)
        .post(`/v1/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', `Api-Key ${KEY}`)
        .send({ code: '123456' })
      expect(res.status).toBe(403)
    })

    it('returns 403 when the key is not allowed for the account', async () => {
      m.authenticate.mockResolvedValue(principal({ accountIds: ['other-account'] }))
      const res = await request(app)
        .post(`/v1/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', `Api-Key ${KEY}`)
        .send({ code: '123456' })
      expect(res.status).toBe(403)
    })

    it('returns 400 when the code is missing', async () => {
      const res = await request(app)
        .post(`/v1/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', `Api-Key ${KEY}`)
        .send({})
      expect(res.status).toBe(400)
      expect(m.submit).not.toHaveBeenCalled()
    })

    it('returns 404 when the account is not owned by the key holder', async () => {
      m.findByIdForUser.mockResolvedValue(null)
      const res = await request(app)
        .post(`/v1/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', `Api-Key ${KEY}`)
        .send({ code: '123456' })
      expect(res.status).toBe(404)
      expect(m.submit).not.toHaveBeenCalled()
    })

    it('surfaces an authentication error as 500', async () => {
      m.authenticate.mockRejectedValue(new Error('db down'))
      const res = await request(app)
        .post(`/v1/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', `Api-Key ${KEY}`)
        .send({ code: '123456' })
      expect(res.status).toBe(500)
    })
  })

  describe('GET /v1/accounts/:accountId/status', () => {
    it('returns the running flag and no pending assistance', async () => {
      m.isRunning.mockReturnValue(true)
      const res = await request(app)
        .get(`/v1/accounts/${ACCOUNT_ID}/status`)
        .set('Authorization', `Api-Key ${KEY}`)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ account_id: ACCOUNT_ID, session_running: true, pending_assistance: null })
    })

    it('includes the pending assistance request when present', async () => {
      m.findPending.mockResolvedValue({ id: 'req-1', type: 'otp', descriptor: { length: 6, type: 'numeric' }, attempts: 2 })
      const res = await request(app)
        .get(`/v1/accounts/${ACCOUNT_ID}/status`)
        .set('Authorization', `Api-Key ${KEY}`)
      expect(res.status).toBe(200)
      expect(res.body.pending_assistance).toEqual({ id: 'req-1', type: 'otp', descriptor: { length: 6, type: 'numeric' }, attempts: 2 })
    })

    it('returns 403 when the key lacks the status:read scope', async () => {
      m.authenticate.mockResolvedValue(principal({ scopes: ['otp:write'] }))
      const res = await request(app)
        .get(`/v1/accounts/${ACCOUNT_ID}/status`)
        .set('Authorization', `Api-Key ${KEY}`)
      expect(res.status).toBe(403)
    })

    it('returns 404 when the account is not owned', async () => {
      m.findByIdForUser.mockResolvedValue(null)
      const res = await request(app)
        .get(`/v1/accounts/${ACCOUNT_ID}/status`)
        .set('Authorization', `Api-Key ${KEY}`)
      expect(res.status).toBe(404)
    })
  })
})
