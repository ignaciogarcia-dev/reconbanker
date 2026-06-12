import { describe, it, expect, vi } from 'vitest'
import { bindRoutes } from './bindRoutes.js'

describe('bindRoutes', () => {
  it('mounts every route group on the express app under its base path', () => {
    const calls: { path: string; handlers: unknown[] }[] = []
    const app = {
      use: vi.fn((path: string, ...handlers: unknown[]) => {
        calls.push({ path, handlers })
      }),
    } as any

    const tokenIssuer = { verify: vi.fn(), issue: vi.fn() }
    const container: any = {
      user: { tokenIssuer, registerUser: {}, login: {}, getCurrentUser: {}, changeOperationMode: {} },
      account: {
        accountRepository: {},
        createAccount: {}, deleteAccount: {},
        listAccountsForUser: {}, getAccountDetail: {},
        getAccountConfig: {}, upsertAccountConfig: {},
        listBanks: {}, createBank: {}, getBankDetail: {},
      },
      banking: {
        runBankScrape: {}, notifyBankMovement: {}, listBankMovements: {}, reNotifyBankMovement: {},
        bankTransactionRepository: {}, sessionManager: {},
      },
      conciliation: {
        runConciliation: {}, processIncomingTransaction: {}, pollPendingOrders: {},
        notifyWebhook: {}, expireStaleRequests: {}, onTransactionIngested: {},
        listConciliationRequests: {}, getConciliationRequestDetail: {}, ownershipChecker: {},
      },
      scriptEngine: { promoteScript: {}, listScripts: {}, getScriptDetail: {} },
    }

    bindRoutes(app, container)

    const paths = calls.map((c) => c.path)
    expect(paths).toEqual([
      '/api/auth',
      '/api/auth/logout',
      '/api/me',
      '/v1',
      '/api/accounts/:accountId/movements',
      '/api/accounts',
      '/api/banks',
      '/api/conciliation',
      '/api/scripts',
    ])
    // Only public /api/auth and the API-key-authenticated /v1 mount without the JWT middleware
    const singleHandlerPaths = new Set(['/api/auth', '/v1'])
    for (const c of calls) {
      if (singleHandlerPaths.has(c.path)) {
        expect(c.handlers).toHaveLength(1)
      } else {
        expect(c.handlers.length).toBeGreaterThanOrEqual(2)
      }
    }
  })
})
