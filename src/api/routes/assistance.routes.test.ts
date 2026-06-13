import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildAssistanceRouter } from './assistance.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

type MockedBanking = {
  assistanceRepo: { findPending: ReturnType<typeof vi.fn> }
  submitAssistanceCode: { execute: ReturnType<typeof vi.fn> }
}
type MockedAccountRepo = { findByIdForUser: ReturnType<typeof vi.fn> }

function makeBanking(): MockedBanking {
  return {
    assistanceRepo: { findPending: vi.fn() },
    submitAssistanceCode: { execute: vi.fn() },
  }
}

function makeApp(banking: MockedBanking, accountRepo: MockedAccountRepo, protectedApp = true) {
  return buildTestApp({
    basePath: '/accounts/:accountId/otp',
    router: buildAssistanceRouter({
      banking: banking as unknown as BankingModule,
      accountRepo: accountRepo as unknown as IAccountRepository,
    }),
    protected: protectedApp,
  })
}

const ACCOUNT_ID = 'b9c224b3-3c2b-42bd-b23e-337ae0185690'

describe('assistance.routes', () => {
  let banking: MockedBanking
  let accountRepo: MockedAccountRepo

  beforeEach(() => {
    banking = makeBanking()
    accountRepo = { findByIdForUser: vi.fn() }
  })

  describe('GET /accounts/:accountId/otp', () => {
    it('returns the pending request when present', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.assistanceRepo.findPending.mockResolvedValue({
        id: 'req-1', type: 'otp', descriptor: { length: 6, type: 'numeric' }, attempts: 2,
      })

      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'req-1', type: 'otp', descriptor: { length: 6, type: 'numeric' }, attempts: 2 })
    })

    it('returns null when there is no pending request', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.assistanceRepo.findPending.mockResolvedValue(null)

      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toBeNull()
    })

    it('returns 404 when the account is not owned', async () => {
      accountRepo.findByIdForUser.mockResolvedValue(null)

      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(banking.assistanceRepo.findPending).not.toHaveBeenCalled()
    })

    it('returns 401 when no userId is set', async () => {
      const res = await request(makeApp(banking, accountRepo, false))
        .get(`/accounts/${ACCOUNT_ID}/otp`)

      expect(res.status).toBe(401)
    })
  })

  describe('POST /accounts/:accountId/otp', () => {
    it('submits the code and returns 202', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.submitAssistanceCode.execute.mockResolvedValue(undefined)

      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', AUTH_HEADER)
        .send({ code: '123456' })

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ submitted: true })
      expect(banking.submitAssistanceCode.execute).toHaveBeenCalledWith(ACCOUNT_ID, '123456')
    })

    it('returns 400 when the code is missing', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })

      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', AUTH_HEADER)
        .send({})

      expect(res.status).toBe(400)
      expect(banking.submitAssistanceCode.execute).not.toHaveBeenCalled()
    })

    it('returns 404 when the account is not owned', async () => {
      accountRepo.findByIdForUser.mockResolvedValue(null)

      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/otp`)
        .set('Authorization', AUTH_HEADER)
        .send({ code: '123456' })

      expect(res.status).toBe(404)
      expect(banking.submitAssistanceCode.execute).not.toHaveBeenCalled()
    })
  })
})
