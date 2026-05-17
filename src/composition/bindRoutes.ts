import type { Express } from 'express'
import type { Container } from './container.js'
import { buildAuthRouter } from '../api/routes/auth.routes.js'
import { buildAccountsRouter } from '../api/routes/accounts.routes.js'
import { buildBankMovementsRouter } from '../api/routes/bank-movements.routes.js'
import { buildBanksRouter } from '../api/routes/banks.routes.js'
import { buildConciliationRouter } from '../api/routes/conciliation.routes.js'
import { buildUserRouter } from '../api/routes/user.routes.js'
import { scriptsRouter } from '../api/routes/scripts.routes.js'
import { buildAuthMiddleware } from '../api/middlewares/auth.middleware.js'

export function bindRoutes(app: Express, container: Container): void {
  app.use('/auth', buildAuthRouter(container.user))

  app.use(buildAuthMiddleware(container.user.tokenIssuer))
  app.use('/me', buildUserRouter(container.user))
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
