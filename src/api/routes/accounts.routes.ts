import { Router, Response } from 'express'
import { db } from '../../shared/infrastructure/db/client.js'
import { AccountRepository } from '../../contexts/account/infrastructure/AccountRepository.js'
import { AccountConfigRepository } from '../../contexts/account/infrastructure/AccountConfigRepository.js'
import { UserRepository } from '../../contexts/user/infrastructure/UserRepository.js'
import { CreateAccountUseCase } from '../../contexts/account/application/CreateAccountUseCase.js'
import { DeleteAccountUseCase } from '../../contexts/account/application/DeleteAccountUseCase.js'
import { AccountConfig, AuthType, PollingMethod } from '../../contexts/account/domain/AccountConfig.js'
import { enqueueBankScrape } from '../../shared/infrastructure/queues/BankScrapeQueue.js'
import { AuthRequest } from '../middlewares/auth.middleware.js'

export const accountsRouter = Router()
export const accountRepoSingleton = new AccountRepository()
const repo = accountRepoSingleton
const configRepo = new AccountConfigRepository()
const userRepo = new UserRepository()

const RESERVED_WEBHOOK_KEYS = ['external_id', 'status', 'amount', 'currency', 'name', 'id', 'received_at']

function toJson(config: AccountConfig, bankUsername: string | null) {
  return {
    id: config.id,
    account_id: config.accountId,
    pending_orders_endpoint: config.pendingOrdersEndpoint,
    webhook_url: config.webhookUrl,
    retry_limit: config.retryLimit,
    polling_method: config.pollingMethod,
    polling_body: config.pollingBody,
    auth_type: config.authType,
    auth_token: config.authToken,
    webhook_auth_type: config.webhookAuthType,
    webhook_auth_token: config.webhookAuthToken,
    notify_on_expired: config.notifyOnExpired,
    webhook_extra_fields: config.webhookExtraFields,
    silent_ingestion: config.silentIngestion,
    bank_username: bankUsername,
  }
}

async function getBankUsername(accountId: string): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT username FROM bank_credentials WHERE account_id = $1 AND status = 'valid'`,
    [accountId]
  )
  return rows[0]?.username ?? null
}

/** Resolves the account if it belongs to the authenticated user; otherwise writes the error response. */
async function requireOwnedAccount(req: AuthRequest, res: Response): Promise<{ accountId: string } | null> {
  const userId = req.userId
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const account = await repo.findByIdForUser(String(req.params.accountId), userId)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return null
  }
  return { accountId: account.id }
}

accountsRouter.get('/', async (req: AuthRequest, res) => {
  const userId = req.userId
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { rows } = await db.query(
    `SELECT a.id, b.code AS bank, a.name, a.status
       FROM accounts a
       JOIN banks b ON b.id = a.bank_id
      WHERE a.status = 'active' AND a.user_id = $1`,
    [userId]
  )
  res.json(rows.map(r => ({
    id: r.id,
    bank: r.bank,
    name: r.name,
    status: r.status,
  })))
})

accountsRouter.post('/', async (req: AuthRequest, res) => {
  const userId = req.userId
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { bankId, name } = req.body
  if (!bankId || !name) {
    res.status(400).json({ error: 'bankId and name are required' })
    return
  }
  const useCase = new CreateAccountUseCase(repo)
  const result = await useCase.execute({ userId, bankId, name })
  res.status(201).json(result)
})

accountsRouter.get('/:accountId', async (req: AuthRequest, res) => {
  const userId = req.userId
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  const account = await repo.findByIdForUser(String(req.params.accountId), userId)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  res.json({ id: account.id, bank: account.bank, name: account.name, status: account.status })
})

accountsRouter.delete('/:accountId', async (req: AuthRequest, res) => {
  const owned = await requireOwnedAccount(req, res)
  if (!owned) return
  const { confirmation_name } = req.body ?? {}
  if (typeof confirmation_name !== 'string' || !confirmation_name.trim()) {
    res.status(400).json({ error: 'confirmation_name is required' })
    return
  }
  const useCase = new DeleteAccountUseCase(repo)
  try {
    await useCase.execute({ id: owned.accountId, confirmationName: confirmation_name })
    res.status(204).end()
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

accountsRouter.get('/:accountId/config', async (req: AuthRequest, res) => {
  const owned = await requireOwnedAccount(req, res)
  if (!owned) return
  const config = await configRepo.findByAccountId(owned.accountId)
  if (!config) {
    res.json(null)
    return
  }
  const bankUsername = await getBankUsername(owned.accountId)
  res.json(toJson(config, bankUsername))
})

accountsRouter.post('/:accountId/scrape', async (req: AuthRequest, res) => {
  const owned = await requireOwnedAccount(req, res)
  if (!owned) return
  const result = await enqueueBankScrape(owned.accountId)
  res.status(202).json(result)
})

accountsRouter.put('/:accountId/config', async (req: AuthRequest, res) => {
  const owned = await requireOwnedAccount(req, res)
  if (!owned) return
  const { accountId } = owned
  const {
    pending_orders_endpoint,
    webhook_url,
    webhook_auth_type,
    webhook_auth_token,
    retry_limit,
    polling_method,
    polling_body,
    auth_type,
    auth_token,
    bank_username,
    bank_password,
    notify_on_expired,
    webhook_extra_fields,
    silent_ingestion,
  } = req.body

  const mode = await userRepo.getOperationMode(req.userId!)
  const normalizedPendingEndpoint =
    typeof pending_orders_endpoint === 'string' && pending_orders_endpoint.trim()
      ? pending_orders_endpoint.trim()
      : null

  if (!webhook_url) {
    res.status(400).json({ error: 'webhook_url is required' })
    return
  }
  if (mode === 'reconcile' && !normalizedPendingEndpoint) {
    res.status(400).json({ error: 'pending_orders_endpoint is required when operation mode is reconcile' })
    return
  }

  let normalizedWebhookExtraFields: Record<string, unknown> | null = null
  if (webhook_extra_fields != null && webhook_extra_fields !== '') {
    let parsed: unknown = webhook_extra_fields
    if (typeof webhook_extra_fields === 'string') {
      try {
        parsed = JSON.parse(webhook_extra_fields)
      } catch {
        res.status(400).json({ error: 'webhook_extra_fields must be valid JSON' })
        return
      }
    }
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      res.status(400).json({ error: 'webhook_extra_fields must be a JSON object' })
      return
    }
    const conflicts = Object.keys(parsed as object).filter(k => RESERVED_WEBHOOK_KEYS.includes(k))
    if (conflicts.length > 0) {
      res.status(400).json({ error: `webhook_extra_fields cannot override reserved keys: ${conflicts.join(', ')}` })
      return
    }
    normalizedWebhookExtraFields = parsed as Record<string, unknown>
  }

  const normalizedPollingMethod: PollingMethod = polling_method === 'POST' ? 'POST' : 'GET'

  let normalizedPollingBody: Record<string, unknown> | null = null
  if (normalizedPollingMethod === 'POST') {
    if (polling_body != null && polling_body !== '') {
      if (typeof polling_body === 'string') {
        const trimmed = polling_body.trim()
        if (trimmed) {
          try {
            normalizedPollingBody = JSON.parse(trimmed)
          } catch {
            res.status(400).json({ error: 'polling_body must be valid JSON (or empty)' })
            return
          }
        }
      } else if (typeof polling_body === 'object' && !Array.isArray(polling_body)) {
        normalizedPollingBody = polling_body as Record<string, unknown>
      }
    }
  }

  const normalizedAuthToken =
    typeof auth_token === 'string' && auth_token.trim() ? auth_token.trim() : null

  const normalizedWebhookAuthToken =
    typeof webhook_auth_token === 'string' && webhook_auth_token.trim() ? webhook_auth_token.trim() : null

  const config = await configRepo.upsert({
    accountId,
    pendingOrdersEndpoint: normalizedPendingEndpoint,
    webhookUrl: webhook_url,
    retryLimit: retry_limit ?? 3,
    pollingMethod: normalizedPollingMethod,
    pollingBody: normalizedPollingBody,
    authType: (auth_type ?? 'bearer') as AuthType,
    authToken: normalizedAuthToken,
    webhookAuthType: (webhook_auth_type ?? null) as AuthType | null,
    webhookAuthToken: normalizedWebhookAuthToken,
    notifyOnExpired: notify_on_expired ?? false,
    webhookExtraFields: normalizedWebhookExtraFields,
    silentIngestion: silent_ingestion ?? false,
  })

  if (bank_username && bank_password) {
    await db.query(
      `INSERT INTO bank_credentials (id, account_id, username, encrypted_password, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'valid')
       ON CONFLICT (account_id) DO UPDATE SET
         username           = $2,
         encrypted_password = $3,
         status             = 'valid',
         last_validated_at  = now()`,
      [accountId, bank_username, bank_password]
    )
  }

  res.json(toJson(config, await getBankUsername(accountId)))
})

// Bank-movements endpoints moved to buildBankMovementsRouter (mounted from composition root).
