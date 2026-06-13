import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { validateBody, validateParams } from '../http/validate.js'
import { UnauthorizedError, NotFoundError } from '../../shared/errors/index.js'
import { otpSubmitRateLimiter } from '../middlewares/rateLimit.middleware.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

const paramsSchema = z.object({ accountId: z.string().uuid() })
const submitSchema = z.object({ code: z.string().min(1).max(32) })

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

export interface AssistanceRouterDeps {
  banking: BankingModule
  accountRepo: IAccountRepository
}

// Dashboard-facing OTP endpoints whose external API key twin lives in the /v1 router
export function buildAssistanceRouter(deps: AssistanceRouterDeps): Router {
  const router = Router({ mergeParams: true })

  async function ownsAccount(accountId: string, userId: string): Promise<boolean> {
    return !!(await deps.accountRepo.findByIdForUser(accountId, userId))
  }

  // Lets the modal recover the pending request on refresh independent of the live WebSocket event
  router.get('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, paramsSchema)
    if (!(await ownsAccount(accountId, userId))) throw new NotFoundError('Account not found')
    const pending = await deps.banking.assistanceRepo.findPending(accountId)
    res.json(pending ? { id: pending.id, type: pending.type, descriptor: pending.descriptor, attempts: pending.attempts } : null)
  }))

  router.post('/', otpSubmitRateLimiter, controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, paramsSchema)
    const { code } = validateBody(req, submitSchema)
    if (!(await ownsAccount(accountId, userId))) throw new NotFoundError('Account not found')
    await deps.banking.submitAssistanceCode.execute(accountId, code)
    res.status(202).json({ submitted: true })
  }))

  return router
}
