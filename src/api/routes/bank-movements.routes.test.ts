import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildBankMovementsRouter } from './bank-movements.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import { NotFoundError } from '../../shared/errors/index.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

vi.mock('../../shared/infrastructure/queues/BankScrapeQueue.js', () => ({
  enqueueBankScrape: vi.fn().mockResolvedValue({ jobId: 'job-1', status: 'queued' }),
}))

type MockedBanking = {
  listBankMovements: { execute: ReturnType<typeof vi.fn> }
  reNotifyBankMovement: { execute: ReturnType<typeof vi.fn> }
  bankTransactionRepository: { findById: ReturnType<typeof vi.fn> }
}

type MockedAccountRepo = {
  findByIdForUser: ReturnType<typeof vi.fn>
}

function makeBanking(): MockedBanking {
  return {
    listBankMovements: { execute: vi.fn() },
    reNotifyBankMovement: { execute: vi.fn() },
    bankTransactionRepository: { findById: vi.fn() },
  }
}

function makeAccountRepo(): MockedAccountRepo {
  return { findByIdForUser: vi.fn() }
}

function makeApp(banking: MockedBanking, accountRepo: MockedAccountRepo) {
  return buildTestApp({
    basePath: '/accounts/:accountId/movements',
    router: buildBankMovementsRouter({
      banking: banking as unknown as BankingModule,
      accountRepo: accountRepo as unknown as IAccountRepository,
    }),
    protected: true,
  })
}

const ACCOUNT_ID = 'b9c224b3-3c2b-42bd-b23e-337ae0185690'
const MOVEMENT_ID = 'a1a2a3a4-b5b6-47c8-9d9d-eaebecedeeef'
const OTHER_ACCOUNT_ID = 'c1c2c3c4-d5d6-47d8-9e9e-faebecedeeef'

describe('bank-movements.routes', () => {
  let banking: MockedBanking
  let accountRepo: MockedAccountRepo

  beforeEach(() => {
    banking = makeBanking()
    accountRepo = makeAccountRepo()
  })

  describe('GET /accounts/:accountId/movements', () => {
    it('returns 200 with movements list', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.listBankMovements.execute.mockResolvedValue([{ id: MOVEMENT_ID }])

      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/movements`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: MOVEMENT_ID }])
      expect(accountRepo.findByIdForUser).toHaveBeenCalledWith(ACCOUNT_ID, 'user-1')
      expect(banking.listBankMovements.execute).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        limit: 100,
        offset: 0,
      })
    })

    it('applies limit and offset from query', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.listBankMovements.execute.mockResolvedValue([])

      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/movements?limit=25&offset=10`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(banking.listBankMovements.execute).toHaveBeenCalledWith({
        accountId: ACCOUNT_ID,
        limit: 25,
        offset: 10,
      })
    })

    it('returns 400 when accountId is not a uuid', async () => {
      const res = await request(makeApp(banking, accountRepo))
        .get('/accounts/bad/movements')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(res.body.error.details.source).toBe('params')
    })

    it('returns 400 when limit exceeds 500', async () => {
      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/movements?limit=600`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(res.body.error.details.source).toBe('query')
    })

    it('returns 400 when offset is negative', async () => {
      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/movements?offset=-1`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
    })

    it('returns 403 when account is not owned by the user', async () => {
      accountRepo.findByIdForUser.mockResolvedValue(null)

      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/movements`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(banking.listBankMovements.execute).not.toHaveBeenCalled()
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/movements`)

      expect(res.status).toBe(401)
      expect(accountRepo.findByIdForUser).not.toHaveBeenCalled()
    })

    it('returns 401 from requireUserId when middleware does not set userId', async () => {
      // Mount the router without auth middleware so req.userId is undefined and
      // requireUserId itself throws UnauthorizedError (defensive guard branch).
      const app = buildTestApp({
        basePath: '/accounts/:accountId/movements',
        router: buildBankMovementsRouter({
          banking: banking as unknown as BankingModule,
          accountRepo: accountRepo as unknown as IAccountRepository,
        }),
        protected: false,
      })

      const res = await request(app).get(`/accounts/${ACCOUNT_ID}/movements`)

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
    })

    it('returns 500 on unexpected error from use case', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.listBankMovements.execute.mockRejectedValue(new Error('boom'))

      const res = await request(makeApp(banking, accountRepo))
        .get(`/accounts/${ACCOUNT_ID}/movements`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(500)
    })
  })

  describe('POST /accounts/:accountId/movements/:movementId/notify', () => {
    it('returns 202 when notification is queued', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.bankTransactionRepository.findById.mockResolvedValue({
        id: MOVEMENT_ID,
        accountId: ACCOUNT_ID,
      })
      banking.reNotifyBankMovement.execute.mockResolvedValue(undefined)

      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/movements/${MOVEMENT_ID}/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ queued: true })
      expect(banking.reNotifyBankMovement.execute).toHaveBeenCalledWith(MOVEMENT_ID)
    })

    it('returns 400 when movementId is not a uuid', async () => {
      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/movements/bad/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
    })

    it('returns 400 when accountId is not a uuid', async () => {
      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/bad/movements/${MOVEMENT_ID}/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
    })

    it('returns 403 when account is not owned', async () => {
      accountRepo.findByIdForUser.mockResolvedValue(null)

      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/movements/${MOVEMENT_ID}/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(banking.bankTransactionRepository.findById).not.toHaveBeenCalled()
    })

    it('returns 403 when movement does not exist', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.bankTransactionRepository.findById.mockResolvedValue(null)

      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/movements/${MOVEMENT_ID}/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(res.body.error.message).toMatch(/Movement not found/)
      expect(banking.reNotifyBankMovement.execute).not.toHaveBeenCalled()
    })

    it('returns 403 when movement belongs to a different account', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.bankTransactionRepository.findById.mockResolvedValue({
        id: MOVEMENT_ID,
        accountId: OTHER_ACCOUNT_ID,
      })

      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/movements/${MOVEMENT_ID}/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(banking.reNotifyBankMovement.execute).not.toHaveBeenCalled()
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/movements/${MOVEMENT_ID}/notify`)

      expect(res.status).toBe(401)
    })

    it('propagates domain errors from reNotifyBankMovement', async () => {
      accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
      banking.bankTransactionRepository.findById.mockResolvedValue({
        id: MOVEMENT_ID,
        accountId: ACCOUNT_ID,
      })
      banking.reNotifyBankMovement.execute.mockRejectedValue(
        new NotFoundError('Movement not found'),
      )

      const res = await request(makeApp(banking, accountRepo))
        .post(`/accounts/${ACCOUNT_ID}/movements/${MOVEMENT_ID}/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(404)
    })
  })
})
