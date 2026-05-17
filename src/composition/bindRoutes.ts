import type { Express } from 'express'
import type { Container } from './container.js'
import { authRouter } from '../api/routes/auth.routes.js'
import { accountsRouter } from '../api/routes/accounts.routes.js'
import { banksRouter } from '../api/routes/banks.routes.js'
import { buildConciliationRouter } from '../api/routes/conciliation.routes.js'
import { scriptsRouter } from '../api/routes/scripts.routes.js'
import { userRouter } from '../api/routes/user.routes.js'
import { authMiddleware } from '../api/middlewares/auth.middleware.js'

/**
 * Mounts API routes onto the Express app, wiring them with the container.
 *
 * Routers are migrated incrementally to the `build<Name>Router(deps)` form.
 * Legacy routers (still global singletons) are mounted as-is until their
 * bounded context goes through Phase 1.
 */
export function bindRoutes(app: Express, container: Container): void {
  app.use('/auth', authRouter)

  app.use(authMiddleware)
  app.use('/me', userRouter)
  app.use('/accounts', accountsRouter)
  app.use('/banks', banksRouter)
  app.use('/conciliation', buildConciliationRouter(container.conciliation))
  app.use('/scripts', scriptsRouter)
}
