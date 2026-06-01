import { Router } from 'express'
import { z } from 'zod'
import { controller } from '../http/controller.js'
import { validateBody } from '../http/validate.js'
import { loginRateLimiter, registerRateLimiter } from '../middlewares/rateLimit.middleware.js'
import type { AuthRequest } from '../middlewares/auth.middleware.js'
import type { UserModule } from '../../composition/userModule.js'
import type { ITokenDenylist } from '../../contexts/user/domain/ports/ITokenDenylist.js'

const passwordPolicy = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')

const registerSchema = z.object({
  email: z.string().email(),
  password: passwordPolicy,
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export function buildAuthRouter(user: UserModule): Router {
  const router = Router()

  router.post('/register', registerRateLimiter, controller(async (req, res) => {
    const { email, password, name } = validateBody(req, registerSchema)
    const result = await user.registerUser.execute({ email, password, name })
    res.status(201).json(result)
  }))

  router.post('/login', loginRateLimiter, controller(async (req, res) => {
    const { email, password } = validateBody(req, loginSchema)
    const result = await user.login.execute({ email, password })
    res.json(result)
  }))

  return router
}

/**
 * Authenticated logout: revokes the current token's jti so it can no longer be
 * used until it would have expired. Mounted behind the auth middleware, which
 * populates req.token. A no-op (still 204) when no denylist is configured.
 */
export function buildLogoutRouter(denylist?: ITokenDenylist): Router {
  const router = Router()

  router.post('/', controller(async (req: AuthRequest, res) => {
    const token = req.token
    if (denylist && token?.jti && token.exp) {
      await denylist.revoke(token.jti, token.exp)
    }
    res.status(204).end()
  }))

  return router
}
