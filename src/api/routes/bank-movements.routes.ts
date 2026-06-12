import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { validateParams, validateQuery } from '../http/validate.js'
import { UnauthorizedError, NotFoundError } from '../../shared/errors/index.js'
import type { BankingModule } from '../../composition/bankingModule.js'
import type { IAccountRepository } from '../../contexts/account/domain/IAccountRepository.js'

const paramsSchema = z.object({ accountId: z.string().uuid() })
const paramsWithMovementSchema = z.object({
  accountId: z.string().uuid(),
  movementId: z.string().uuid(),
})
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

export interface BankMovementsRouterDeps {
  banking: BankingModule
  accountRepo: IAccountRepository
}

export function buildBankMovementsRouter(deps: BankMovementsRouterDeps): Router {
  const router = Router({ mergeParams: true })

  async function ownsAccount(accountId: string, userId: string): Promise<boolean> {
    return !!(await deps.accountRepo.findByIdForUser(accountId, userId))
  }

  router.get('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, paramsSchema)
    const { limit, offset } = validateQuery(req, listQuerySchema)
    if (!(await ownsAccount(accountId, userId))) throw new NotFoundError('Account not found')
    const movements = await deps.banking.listBankMovements.execute({ accountId, limit, offset })
    res.json(movements)
  }))

  router.get('/dead-letters', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, paramsSchema)
    if (!(await ownsAccount(accountId, userId))) throw new NotFoundError('Account not found')
    const deadLetters = await deps.banking.listWebhookDeadLetters.execute(accountId)
    res.json(deadLetters)
  }))

  router.post('/:movementId/notify', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId, movementId } = validateParams(req, paramsWithMovementSchema)
    if (!(await ownsAccount(accountId, userId))) throw new NotFoundError('Account not found')
    const tx = await deps.banking.bankTransactionRepository.findById(movementId)
    if (!tx || tx.accountId !== accountId) throw new NotFoundError('Movement not found for this account')
    await deps.banking.reNotifyBankMovement.execute(movementId)
    res.status(202).json({ queued: true })
  }))

  return router
}
