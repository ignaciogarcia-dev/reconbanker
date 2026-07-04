import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildReactivateRouter } from './reactivate.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

type MockedBanking = { reactivateSession: { execute: ReturnType<typeof vi.fn> } }
type MockedAccountRepo = { findByIdForUser: ReturnType<typeof vi.fn> }

function makeApp(banking: MockedBanking, accountRepo: MockedAccountRepo, protectedApp = true) {
  return buildTestApp({
    basePath: '/accounts/:accountId/reactivate',
    router: buildReactivateRouter({
      banking: banking as unknown as BankingModule,
      accountRepo: accountRepo as unknown as IAccountRepository,
    }),
    protected: protectedApp,
  })
}

const ACCOUNT_ID = 'b9c224b3-3c2b-42bd-b23e-337ae0185690'

describe('reactivate.routes', () => {
  let banking: MockedBanking
  let accountRepo: MockedAccountRepo

  beforeEach(() => {
    banking = { reactivateSession: { execute: vi.fn() } }
    accountRepo = { findByIdForUser: vi.fn() }
  })

  it('reactivates an owned account and returns 202', async () => {
    accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
    banking.reactivateSession.execute.mockResolvedValue({ queued: true })

    const res = await request(makeApp(banking, accountRepo))
      .post(`/accounts/${ACCOUNT_ID}/reactivate`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ queued: true })
    expect(banking.reactivateSession.execute).toHaveBeenCalledWith(ACCOUNT_ID)
  })

  it('returns 404 when the account is not owned', async () => {
    accountRepo.findByIdForUser.mockResolvedValue(null)

    const res = await request(makeApp(banking, accountRepo))
      .post(`/accounts/${ACCOUNT_ID}/reactivate`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(404)
    expect(banking.reactivateSession.execute).not.toHaveBeenCalled()
  })

  it('returns 401 when no userId is set', async () => {
    const res = await request(makeApp(banking, accountRepo, false))
      .post(`/accounts/${ACCOUNT_ID}/reactivate`)

    expect(res.status).toBe(401)
    expect(banking.reactivateSession.execute).not.toHaveBeenCalled()
  })
})
