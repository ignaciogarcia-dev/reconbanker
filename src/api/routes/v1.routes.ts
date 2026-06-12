import { Router } from 'express'
import { z } from 'zod'
import { controller } from '../http/controller.js'
import { validateBody, validateParams } from '../http/validate.js'
import { NotFoundError } from '../../shared/errors/index.js'
import { ApiKeyRequest, buildApiKeyMiddleware, requireScope } from '../middlewares/apiKey.middleware.js'
import { otpSubmitRateLimiter } from '../middlewares/rateLimit.middleware.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { UserModule } from '../../composition/userModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

const paramsSchema = z.object({ accountId: z.string().uuid() })
const submitSchema = z.object({ code: z.string().min(1).max(32) })

export interface V1RouterDeps {
  user: UserModule
  banking: BankingModule
  accountRepo: IAccountRepository
}

// External machine-to-machine API authenticated by API key and never JWT
export function buildV1Router(deps: V1RouterDeps): Router {
  const router = Router()
  const apiKeyAuth = buildApiKeyMiddleware(deps.user.authenticateApiKey)

  // Closes the gap for allow-all keys so they can never reach another user's account
  async function assertOwned(req: ApiKeyRequest, accountId: string): Promise<void> {
    const userId = req.apiKey!.userId
    if (!(await deps.accountRepo.findByIdForUser(accountId, userId))) {
      throw new NotFoundError('Account not found')
    }
  }

  router.post(
    '/accounts/:accountId/otp',
    apiKeyAuth, requireScope('otp:write'), otpSubmitRateLimiter,
    controller(async (req: ApiKeyRequest, res) => {
      const { accountId } = validateParams(req, paramsSchema)
      const { code } = validateBody(req, submitSchema)
      await assertOwned(req, accountId)
      await deps.banking.submitAssistanceCode.execute(accountId, code)
      res.status(202).json({ submitted: true })
    })
  )

  router.get(
    '/accounts/:accountId/status',
    apiKeyAuth, requireScope('status:read'),
    controller(async (req: ApiKeyRequest, res) => {
      const { accountId } = validateParams(req, paramsSchema)
      await assertOwned(req, accountId)
      const pending = await deps.banking.assistanceRepo.findPending(accountId)
      res.json({
        account_id: accountId,
        session_running: deps.banking.sessionManager.isRunning(accountId),
        pending_assistance: pending
          ? { id: pending.id, type: pending.type, descriptor: pending.descriptor, attempts: pending.attempts }
          : null,
      })
    })
  )

  return router
}
