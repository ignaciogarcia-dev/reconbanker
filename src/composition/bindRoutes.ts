import type { Express } from 'express'
import type { Container } from './container.js'
import { authRouter } from '../api/routes/auth.routes.js'
import { buildAccountsRouter } from '../api/routes/accounts.routes.js'
import { buildBankMovementsRouter } from '../api/routes/bank-movements.routes.js'
import { buildBanksRouter } from '../api/routes/banks.routes.js'
import { buildConciliationRouter } from '../api/routes/conciliation.routes.js'
import { scriptsRouter } from '../api/routes/scripts.routes.js'
import { userRouter } from '../api/routes/user.routes.js'
import { authMiddleware } from '../api/middlewares/auth.middleware.js'

/**
 * Mounts API routes onto the Express app, wiring them with the container.
 */
export function bindRoutes(app: Express, container: Container): void {
  app.use('/auth', authRouter)

  app.use(authMiddleware)
  app.use('/me', userRouter)
  app.use('/accounts', buildAccountsRouter(container.account))
  app.use(
    '/accounts/:accountId/movements',
    buildBankMovementsRouter({
      banking: container.banking,
      accountRepo: container.account.accountRepository,
    })
  )
  app.use('/banks', buildBanksRouter(container.account))
  app.use('/conciliation', buildConciliationRouter(container.conciliation))
  app.use('/scripts', scriptsRouter)
}
