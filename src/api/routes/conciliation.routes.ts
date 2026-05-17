import { Router } from 'express'
import { z } from 'zod'
import { Queues } from '../../shared/infrastructure/queues/QueueRegistry.js'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { validateParams, validateQuery } from '../http/validate.js'
import { UnauthorizedError, ForbiddenError } from '../../shared/errors/index.js'
import type { ConciliationModule } from '../../composition/conciliationModule.js'

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().min(1).optional(),
})

const requestIdParams = z.object({ requestId: z.string().min(1) })
const accountIdParams = z.object({ accountId: z.string().min(1) })

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

export function buildConciliationRouter(conciliation: ConciliationModule): Router {
  const router = Router()

  router.get('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { limit, offset, status } = validateQuery(req, listQuerySchema)
    const rows = await conciliation.listConciliationRequests.execute({
      userId, limit, offset, status,
    })
    res.json(rows)
  }))

  router.get('/:requestId', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { requestId } = validateParams(req, requestIdParams)
    const detail = await conciliation.getConciliationRequestDetail.execute(requestId, userId)
    res.json(detail)
  }))

  router.post('/:requestId/run', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { requestId } = validateParams(req, requestIdParams)
    if (!(await conciliation.ownershipChecker.ownsRequest(requestId, userId))) {
      throw new ForbiddenError('Not allowed')
    }
    await Queues.conciliation.add('run', { requestId })
    res.status(202).json({ queued: true })
  }))

  router.post('/:requestId/notify', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { requestId } = validateParams(req, requestIdParams)
    if (!(await conciliation.ownershipChecker.ownsRequest(requestId, userId))) {
      throw new ForbiddenError('Not allowed')
    }
    await Queues.webhook.add('notify', { requestId })
    res.status(202).json({ queued: true })
  }))

  router.post('/poll/:accountId', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, accountIdParams)
    if (!(await conciliation.ownershipChecker.ownsAccount(accountId, userId))) {
      throw new ForbiddenError('Not allowed')
    }
    await Queues.orderIngestion.add('poll', { accountId })
    res.status(202).json({ queued: true })
  }))

  return router
}

/**
 * @deprecated Use buildConciliationRouter via composition root.
 * Kept for legacy `bindRoutes` callers; will be removed once all callers
 * use the container-driven version.
 */
export const conciliationRouter = Router()
