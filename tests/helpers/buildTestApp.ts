import express, { type Express, type Router } from 'express'
import { errorMiddleware } from '../../src/api/middlewares/error.middleware.js'
import { buildAuthMiddleware } from '../../src/api/middlewares/auth.middleware.js'
import type { ITokenIssuer } from '../../src/contexts/user/domain/ports/ITokenIssuer.js'

/**
 * Mounts a router under a base path inside a minimal Express app and returns it.
 * Used by router tests to exercise endpoints with supertest without spinning up
 * the full DI container. Pass `protected: true` to wrap the router in the auth
 * middleware that resolves to `userId = 'user-1'` for any bearer token, or
 * `protected: false` to expose the router unauthenticated.
 */
export function buildTestApp(opts: {
  basePath: string
  router: Router
  protected?: boolean
  userId?: string
  verify?: ITokenIssuer['verify']
}): Express {
  const app = express()
  app.use(express.json())

  if (opts.protected) {
    const userId = opts.userId ?? 'user-1'
    const tokenIssuer: ITokenIssuer = {
      issue: () => 'fake-token',
      verify: opts.verify ?? (() => ({ sub: userId, email: 'user@example.com' })),
    }
    app.use(opts.basePath, buildAuthMiddleware(tokenIssuer), opts.router)
  } else {
    app.use(opts.basePath, opts.router)
  }

  app.use(errorMiddleware)
  return app
}

export const AUTH_HEADER = 'Bearer fake-token'
