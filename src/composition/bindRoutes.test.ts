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
        createAccount: {}, deleteAccount: {}, clearScrapeBlock: {},
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
      '/api/me',
      '/api/accounts/:accountId/movements',
      '/api/accounts',
      '/api/banks',
      '/api/conciliation',
      '/api/scripts',
    ])
    // Auth path has no middleware before the router; all others have the protected middleware.
    expect(calls[0].handlers).toHaveLength(1)
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].handlers.length).toBeGreaterThanOrEqual(2)
    }
  })
})
