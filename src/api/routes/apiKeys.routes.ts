import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { validateBody, validateParams } from '../http/validate.js'
import { UnauthorizedError, NotFoundError } from '../../shared/errors/index.js'
import { ApiKey, ALL_API_SCOPES } from '../../contexts/user/domain/ApiKey.js'
import type { UserModule } from '../../composition/userModule.js'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['otp:write', 'status:read'])).min(1),
  account_ids: z.array(z.string().uuid()).nullable().optional(),
})
const idParams = z.object({ id: z.string().uuid() })
// `.default({})` so a bodyless DELETE (no JSON body at all) is treated as "no code"
const revokeSchema = z.object({ code: z.string().optional() }).default({})

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

function toJson(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    // Show only the prefix so the user can recognize a key without its secret
    prefix: key.prefix,
    scopes: key.scopes,
    account_ids: key.accountIds,
    created_at: key.createdAt,
    last_used_at: key.lastUsedAt,
    revoked_at: key.revokedAt,
  }
}

// User-facing API key management mounted JWT-protected at /api/me/api-keys
export function buildApiKeysRouter(user: UserModule): Router {
  const router = Router()

  router.get('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const keys = await user.listApiKeys.execute(userId)
    res.json({ keys: keys.map(toJson), available_scopes: ALL_API_SCOPES })
  }))

  router.post('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const body = validateBody(req, createSchema)
    const { apiKey, plaintext } = await user.createApiKey.execute({
      userId,
      name: body.name,
      scopes: body.scopes,
      accountIds: body.account_ids ?? null,
    })
    // `key` is returned ONCE here and never again
    res.status(201).json({ ...toJson(apiKey), key: plaintext })
  }))

  router.delete('/:id', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { id } = validateParams(req, idParams)
    const { code } = validateBody(req, revokeSchema)
    const revoked = await user.revokeApiKey.execute(id, userId, code)
    if (!revoked) throw new NotFoundError('API key not found')
    res.status(204).end()
  }))

  return router
}
