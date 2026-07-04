import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildKillRouter } from './kill.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

type MockedBanking = { killSession: { execute: ReturnType<typeof vi.fn> } }
type MockedAccountRepo = { findByIdForUser: ReturnType<typeof vi.fn> }

function makeApp(banking: MockedBanking, accountRepo: MockedAccountRepo, protectedApp = true) {
  return buildTestApp({
    basePath: '/accounts/:accountId/kill',
    router: buildKillRouter({
      banking: banking as unknown as BankingModule,
      accountRepo: accountRepo as unknown as IAccountRepository,
    }),
    protected: protectedApp,
  })
}

const ACCOUNT_ID = 'b9c224b3-3c2b-42bd-b23e-337ae0185690'

describe('kill.routes', () => {
  let banking: MockedBanking
  let accountRepo: MockedAccountRepo

  beforeEach(() => {
    banking = { killSession: { execute: vi.fn() } }
    accountRepo = { findByIdForUser: vi.fn() }
  })

  it('kills an owned account session and returns 202', async () => {
    accountRepo.findByIdForUser.mockResolvedValue({ id: ACCOUNT_ID })
    banking.killSession.execute.mockResolvedValue({ killed: true })

    const res = await request(makeApp(banking, accountRepo))
      .post(`/accounts/${ACCOUNT_ID}/kill`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(202)
    expect(res.body).toEqual({ killed: true })
    expect(banking.killSession.execute).toHaveBeenCalledWith(ACCOUNT_ID)
  })

  it('returns 404 when the account is not owned', async () => {
    accountRepo.findByIdForUser.mockResolvedValue(null)

    const res = await request(makeApp(banking, accountRepo))
      .post(`/accounts/${ACCOUNT_ID}/kill`)
      .set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(404)
    expect(banking.killSession.execute).not.toHaveBeenCalled()
  })

  it('returns 401 when no userId is set', async () => {
    const res = await request(makeApp(banking, accountRepo, false))
      .post(`/accounts/${ACCOUNT_ID}/kill`)

    expect(res.status).toBe(401)
    expect(banking.killSession.execute).not.toHaveBeenCalled()
  })
})
