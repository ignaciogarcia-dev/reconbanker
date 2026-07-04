import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { validateParams } from '../http/validate.js'
import { UnauthorizedError, NotFoundError } from '../../shared/errors/index.js'
import { expensiveActionRateLimiter } from '../middlewares/rateLimit.middleware.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

const paramsSchema = z.object({ accountId: z.string().uuid() })

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

export interface ReactivateRouterDeps {
  banking: BankingModule
  accountRepo: IAccountRepository
}

// Manual reactivation of an assisted persistent session that parked in needs_attention.
// Mirrors the /otp and /movements sub-routers (own ownership check, banking use case).
export function buildReactivateRouter(deps: ReactivateRouterDeps): Router {
  const router = Router({ mergeParams: true })

  router.post('/', expensiveActionRateLimiter, controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, paramsSchema)
    if (!(await deps.accountRepo.findByIdForUser(accountId, userId))) throw new NotFoundError('Account not found')
    const result = await deps.banking.reactivateSession.execute(accountId)
    res.status(202).json(result)
  }))

  return router
}
