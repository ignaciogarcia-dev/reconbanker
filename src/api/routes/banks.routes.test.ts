import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildBanksRouter } from './banks.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import { ConflictError, NotFoundError } from '../../shared/errors/index.js'
import type { AccountModule } from '../../composition/accountModule.js'

type MockedAccountModule = {
  listBanks: { execute: ReturnType<typeof vi.fn> }
  createBank: { execute: ReturnType<typeof vi.fn> }
  getBankDetail: { execute: ReturnType<typeof vi.fn> }
}

function makeAccountModule(): MockedAccountModule {
  return {
    listBanks: { execute: vi.fn() },
    createBank: { execute: vi.fn() },
    getBankDetail: { execute: vi.fn() },
  }
}

function makeApp(account: MockedAccountModule) {
  return buildTestApp({
    basePath: '/banks',
    router: buildBanksRouter(account as unknown as AccountModule),
    protected: true,
  })
}

const VALID_UUID = 'b9c224b3-3c2b-42bd-b23e-337ae0185690'

describe('banks.routes', () => {
  let account: MockedAccountModule

  beforeEach(() => {
    account = makeAccountModule()
  })

  describe('GET /banks', () => {
    it('returns 200 with banks list', async () => {
      account.listBanks.execute.mockResolvedValue([{ id: 'b1', code: 'bnk', name: 'Bank' }])

      const res = await request(makeApp(account))
        .get('/banks')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 'b1', code: 'bnk', name: 'Bank' }])
      expect(account.listBanks.execute).toHaveBeenCalledTimes(1)
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(account)).get('/banks')
      expect(res.status).toBe(401)
      expect(account.listBanks.execute).not.toHaveBeenCalled()
    })

    it('returns 500 on unexpected errors', async () => {
      account.listBanks.execute.mockRejectedValue(new Error('boom'))

      const res = await request(makeApp(account))
        .get('/banks')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(500)
    })
  })

  describe('POST /banks', () => {
    it('returns 201 with created bank on valid body', async () => {
      account.createBank.execute.mockResolvedValue({ id: 'b1', code: 'bnk', name: 'Bank' })

      const res = await request(makeApp(account))
        .post('/banks')
        .set('Authorization', AUTH_HEADER)
        .send({ code: 'bnk', name: 'Bank', loginUrl: 'https://x.test' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: 'b1', code: 'bnk', name: 'Bank' })
      expect(account.createBank.execute).toHaveBeenCalledWith({
        code: 'bnk',
        name: 'Bank',
        loginUrl: 'https://x.test',
      })
    })

    it('accepts a body without loginUrl (optional)', async () => {
      account.createBank.execute.mockResolvedValue({ id: 'b2', code: 'bnk2', name: 'Bank2' })

      const res = await request(makeApp(account))
        .post('/banks')
        .set('Authorization', AUTH_HEADER)
        .send({ code: 'bnk2', name: 'Bank2' })

      expect(res.status).toBe(201)
      expect(account.createBank.execute).toHaveBeenCalledWith({
        code: 'bnk2',
        name: 'Bank2',
        loginUrl: undefined,
      })
    })

    it('returns 400 when code is missing', async () => {
      const res = await request(makeApp(account))
        .post('/banks')
        .set('Authorization', AUTH_HEADER)
        .send({ name: 'Bank' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(account.createBank.execute).not.toHaveBeenCalled()
    })

    it('returns 400 when name is empty', async () => {
      const res = await request(makeApp(account))
        .post('/banks')
        .set('Authorization', AUTH_HEADER)
        .send({ code: 'bnk', name: '' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 409 when the use case throws ConflictError', async () => {
      account.createBank.execute.mockRejectedValue(
        new ConflictError('Bank already exists', { code: 'bnk' }),
      )

      const res = await request(makeApp(account))
        .post('/banks')
        .set('Authorization', AUTH_HEADER)
        .send({ code: 'bnk', name: 'Bank' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONFLICT')
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(account))
        .post('/banks')
        .send({ code: 'bnk', name: 'Bank' })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /banks/:bankId', () => {
    it('returns 200 with bank detail on valid uuid', async () => {
      account.getBankDetail.execute.mockResolvedValue({
        id: VALID_UUID,
        code: 'bnk',
        name: 'Bank',
      })

      const res = await request(makeApp(account))
        .get(`/banks/${VALID_UUID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body.id).toBe(VALID_UUID)
      expect(account.getBankDetail.execute).toHaveBeenCalledWith(VALID_UUID)
    })

    it('returns 400 when bankId is not a uuid', async () => {
      const res = await request(makeApp(account))
        .get('/banks/not-a-uuid')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.details.source).toBe('params')
      expect(account.getBankDetail.execute).not.toHaveBeenCalled()
    })

    it('returns 404 when use case throws NotFoundError', async () => {
      account.getBankDetail.execute.mockRejectedValue(new NotFoundError('Bank not found'))

      const res = await request(makeApp(account))
        .get(`/banks/${VALID_UUID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(account)).get(`/banks/${VALID_UUID}`)
      expect(res.status).toBe(401)
    })
  })
})
