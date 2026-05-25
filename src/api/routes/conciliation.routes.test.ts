import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const conciliationAdd = vi.fn()
const webhookAdd = vi.fn()
const orderIngestionAdd = vi.fn()

vi.mock('../../shared/infrastructure/queues/QueueRegistry.js', () => ({
  Queues: {
    conciliation: { add: conciliationAdd },
    webhook: { add: webhookAdd },
    orderIngestion: { add: orderIngestionAdd },
  },
}))

const { buildConciliationRouter } = await import('./conciliation.routes.js')
const { buildTestApp, AUTH_HEADER } = await import('../../../tests/helpers/buildTestApp.js')
const { ForbiddenError, NotFoundError } = await import('../../shared/errors/index.js')

type MockedConciliationModule = {
  listConciliationRequests: { execute: ReturnType<typeof vi.fn> }
  getConciliationRequestDetail: { execute: ReturnType<typeof vi.fn> }
  ownershipChecker: {
    ownsRequest: ReturnType<typeof vi.fn>
    ownsAccount: ReturnType<typeof vi.fn>
  }
}

function makeModule(): MockedConciliationModule {
  return {
    listConciliationRequests: { execute: vi.fn() },
    getConciliationRequestDetail: { execute: vi.fn() },
    ownershipChecker: {
      ownsRequest: vi.fn(),
      ownsAccount: vi.fn(),
    },
  }
}

function makeApp(mod: MockedConciliationModule, opts?: { protected?: boolean; userId?: string }) {
  return buildTestApp({
    basePath: '/conciliation',
    router: buildConciliationRouter(mod as never),
    protected: opts?.protected ?? true,
    userId: opts?.userId,
  })
}

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'

describe('conciliation.routes', () => {
  let mod: MockedConciliationModule

  beforeEach(() => {
    mod = makeModule()
    conciliationAdd.mockReset()
    webhookAdd.mockReset()
    orderIngestionAdd.mockReset()
  })

  describe('GET /conciliation', () => {
    it('returns 200 with the list using default query', async () => {
      mod.listConciliationRequests.execute.mockResolvedValue([{ id: 'r1' }])

      const res = await request(makeApp(mod))
        .get('/conciliation')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 'r1' }])
      expect(mod.listConciliationRequests.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        limit: 50,
        offset: 0,
        status: undefined,
      })
    })

    it('passes through limit, offset and status', async () => {
      mod.listConciliationRequests.execute.mockResolvedValue([])

      const res = await request(makeApp(mod))
        .get('/conciliation?limit=10&offset=5&status=pending')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(mod.listConciliationRequests.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        limit: 10,
        offset: 5,
        status: 'pending',
      })
    })

    it('returns 400 when limit exceeds the maximum', async () => {
      const res = await request(makeApp(mod))
        .get('/conciliation?limit=9999')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.details.source).toBe('query')
      expect(mod.listConciliationRequests.execute).not.toHaveBeenCalled()
    })

    it('returns 400 when offset is negative', async () => {
      const res = await request(makeApp(mod))
        .get('/conciliation?offset=-1')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(mod)).get('/conciliation')
      expect(res.status).toBe(401)
      expect(mod.listConciliationRequests.execute).not.toHaveBeenCalled()
    })

    it('returns 401 when the request has no userId on a router mounted without auth', async () => {
      const app = makeApp(mod, { protected: false })
      const res = await request(app).get('/conciliation')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHORIZED')
      expect(mod.listConciliationRequests.execute).not.toHaveBeenCalled()
    })
  })

  describe('GET /conciliation/:requestId', () => {
    it('returns 200 with the detail on a valid uuid', async () => {
      mod.getConciliationRequestDetail.execute.mockResolvedValue({ id: REQUEST_ID })

      const res = await request(makeApp(mod))
        .get(`/conciliation/${REQUEST_ID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: REQUEST_ID })
      expect(mod.getConciliationRequestDetail.execute).toHaveBeenCalledWith(REQUEST_ID, 'user-1')
    })

    it('returns 400 when requestId is not a uuid', async () => {
      const res = await request(makeApp(mod))
        .get('/conciliation/not-a-uuid')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.details.source).toBe('params')
    })

    it('returns 404 when the use case throws NotFoundError', async () => {
      mod.getConciliationRequestDetail.execute.mockRejectedValue(new NotFoundError('missing'))

      const res = await request(makeApp(mod))
        .get(`/conciliation/${REQUEST_ID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /conciliation/:requestId/run', () => {
    it('enqueues a run job and returns 202 when the user owns the request', async () => {
      mod.ownershipChecker.ownsRequest.mockResolvedValue(true)

      const res = await request(makeApp(mod))
        .post(`/conciliation/${REQUEST_ID}/run`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ queued: true })
      expect(mod.ownershipChecker.ownsRequest).toHaveBeenCalledWith(REQUEST_ID, 'user-1')
      expect(conciliationAdd).toHaveBeenCalledWith('run', { requestId: REQUEST_ID })
    })

    it('returns 403 when the user does not own the request', async () => {
      mod.ownershipChecker.ownsRequest.mockResolvedValue(false)

      const res = await request(makeApp(mod))
        .post(`/conciliation/${REQUEST_ID}/run`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(conciliationAdd).not.toHaveBeenCalled()
    })

    it('returns 400 when requestId is not a uuid', async () => {
      const res = await request(makeApp(mod))
        .post('/conciliation/bad/run')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(mod.ownershipChecker.ownsRequest).not.toHaveBeenCalled()
    })

    it('propagates use case errors via the error middleware', async () => {
      mod.ownershipChecker.ownsRequest.mockRejectedValue(new ForbiddenError('nope'))

      const res = await request(makeApp(mod))
        .post(`/conciliation/${REQUEST_ID}/run`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
    })
  })

  describe('POST /conciliation/:requestId/notify', () => {
    it('enqueues a webhook notify and returns 202', async () => {
      mod.ownershipChecker.ownsRequest.mockResolvedValue(true)

      const res = await request(makeApp(mod))
        .post(`/conciliation/${REQUEST_ID}/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ queued: true })
      expect(webhookAdd).toHaveBeenCalledWith('notify', { requestId: REQUEST_ID })
    })

    it('returns 403 when the user does not own the request', async () => {
      mod.ownershipChecker.ownsRequest.mockResolvedValue(false)

      const res = await request(makeApp(mod))
        .post(`/conciliation/${REQUEST_ID}/notify`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(webhookAdd).not.toHaveBeenCalled()
    })

    it('returns 400 when requestId is not a uuid', async () => {
      const res = await request(makeApp(mod))
        .post('/conciliation/bad/notify')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
    })
  })

  describe('POST /conciliation/poll/:accountId', () => {
    it('enqueues a poll job and returns 202', async () => {
      mod.ownershipChecker.ownsAccount.mockResolvedValue(true)

      const res = await request(makeApp(mod))
        .post(`/conciliation/poll/${ACCOUNT_ID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(202)
      expect(res.body).toEqual({ queued: true })
      expect(mod.ownershipChecker.ownsAccount).toHaveBeenCalledWith(ACCOUNT_ID, 'user-1')
      expect(orderIngestionAdd).toHaveBeenCalledWith('poll', { accountId: ACCOUNT_ID })
    })

    it('returns 403 when the user does not own the account', async () => {
      mod.ownershipChecker.ownsAccount.mockResolvedValue(false)

      const res = await request(makeApp(mod))
        .post(`/conciliation/poll/${ACCOUNT_ID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(orderIngestionAdd).not.toHaveBeenCalled()
    })

    it('returns 400 when accountId is not a uuid', async () => {
      const res = await request(makeApp(mod))
        .post('/conciliation/poll/bad')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(mod)).post(`/conciliation/poll/${ACCOUNT_ID}`)
      expect(res.status).toBe(401)
    })
  })
})
