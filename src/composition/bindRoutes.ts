import type { Express } from 'express'
import type { Container } from './container.js'
import { buildAuthRouter, buildLogoutRouter } from '../api/routes/auth.routes.js'
import { buildAccountsRouter } from '../api/routes/accounts.routes.js'
import { buildBankMovementsRouter } from '../api/routes/bank-movements.routes.js'
import { buildBanksRouter } from '../api/routes/banks.routes.js'
import { buildConciliationRouter } from '../api/routes/conciliation.routes.js'
import { buildUserRouter } from '../api/routes/user.routes.js'
import { buildScriptsRouter } from '../api/routes/scripts.routes.js'
import { buildApiKeysRouter } from '../api/routes/apiKeys.routes.js'
import { buildAuthMiddleware } from '../api/middlewares/auth.middleware.js'
import { buildRequireAdmin } from '../api/middlewares/requireAdmin.middleware.js'

export function bindRoutes(app: Express, container: Container): void {
  app.use('/api/auth', buildAuthRouter(container.user))

  const protectedApi = buildAuthMiddleware(container.user.tokenIssuer, container.user.tokenDenylist)
  const requireAdmin = buildRequireAdmin(container.user.userRepository)

  app.use('/api/auth/logout', protectedApi, buildLogoutRouter(container.user.tokenDenylist))
  app.use('/api/me', protectedApi, buildUserRouter(container.user))
  app.use('/api/me/api-keys', protectedApi, buildApiKeysRouter(container.user))
  app.use(
    '/api/accounts/:accountId/movements',
    protectedApi,
    buildBankMovementsRouter({
      banking: container.banking,
      accountRepo: container.account.accountRepository,
    })
  )
  app.use('/api/accounts', protectedApi, buildAccountsRouter(container.account))
  app.use('/api/banks', protectedApi, buildBanksRouter(container.account, requireAdmin))
  app.use('/api/conciliation', protectedApi, buildConciliationRouter(container.conciliation))
  app.use('/api/scripts', protectedApi, buildScriptsRouter(container.scriptEngine, requireAdmin))
}
