import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { validateBody } from '../http/validate.js'
import { UnauthorizedError } from '../../shared/errors/index.js'
import type { UserModule } from '../../composition/userModule.js'

const operationModeSchema = z.object({
  mode: z.enum(['reconcile', 'passthrough']),
})

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

export function buildUserRouter(user: UserModule): Router {
  const router = Router()

  router.get('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const me = await user.getCurrentUser.execute(userId)
    res.json({
      id: me.id,
      email: me.email,
      name: me.name,
      operation_mode: me.operationMode,
    })
  }))

  router.put('/operation-mode', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { mode } = validateBody(req, operationModeSchema)
    const result = await user.changeOperationMode.execute({ userId, mode })
    res.json({ operation_mode: result.mode })
  }))

  return router
}
