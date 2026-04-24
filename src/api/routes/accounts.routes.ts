import { Router } from 'express'
import { db } from '../../shared/infrastructure/db/client.js'
import { AccountRepository } from '../../contexts/account/infrastructure/AccountRepository.js'
import { AccountConfigRepository } from '../../contexts/account/infrastructure/AccountConfigRepository.js'
import { BankTransactionRepository } from '../../contexts/banking/infrastructure/BankTransactionRepository.js'
import { CreateAccountUseCase } from '../../contexts/account/application/CreateAccountUseCase.js'
import { DeleteAccountUseCase } from '../../contexts/account/application/DeleteAccountUseCase.js'
import { AccountConfig, AccountMode, AuthType, PollingMethod } from '../../contexts/account/domain/AccountConfig.js'

export const accountsRouter = Router()
const repo = new AccountRepository()
const configRepo = new AccountConfigRepository()
const bankTxRepo = new BankTransactionRepository()

const RESERVED_WEBHOOK_KEYS = ['external_id', 'status', 'amount', 'currency', 'sender_name', 'id', 'received_at']

function toJson(config: AccountConfig, bankUsername: string | null) {
  return {
    id: config.id,
    account_id: config.accountId,
    mode: config.mode,
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

accountsRouter.get('/', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT a.id, b.code AS bank, a.name, a.status, ac.mode
       FROM accounts a
       JOIN banks b ON b.id = a.bank_id
       LEFT JOIN account_config ac ON ac.account_id = a.id
      WHERE a.status = 'active'`
  )
  res.json(rows.map(r => ({
    id: r.id,
    bank: r.bank,
    name: r.name,
    status: r.status,
    mode: r.mode ?? 'reconcile',
  })))
})

accountsRouter.post('/', async (req, res) => {
  const { bankId, name } = req.body
  if (!bankId || !name) {
    res.status(400).json({ error: 'bankId and name are required' })
    return
  }
  const useCase = new CreateAccountUseCase(repo)
  const result = await useCase.execute({ bankId, name })
  res.status(201).json(result)
})

accountsRouter.get('/:accountId', async (req, res) => {
  const account = await repo.findById(req.params.accountId)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  res.json({ id: account.id, bank: account.bank, name: account.name, status: account.status })
})

accountsRouter.delete('/:accountId', async (req, res) => {
  const { confirmation_name } = req.body ?? {}
  if (typeof confirmation_name !== 'string' || !confirmation_name.trim()) {
    res.status(400).json({ error: 'confirmation_name is required' })
    return
  }
  const useCase = new DeleteAccountUseCase(repo)
  try {
    await useCase.execute({ id: req.params.accountId, confirmationName: confirmation_name })
    res.status(204).end()
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

accountsRouter.get('/:accountId/config', async (req, res) => {
  const config = await configRepo.findByAccountId(req.params.accountId)
  if (!config) {
    res.json(null)
    return
  }
  const bankUsername = await getBankUsername(req.params.accountId)
  res.json(toJson(config, bankUsername))
})

accountsRouter.post('/:accountId/scrape', async (req, res) => {
  const { Queues } = await import('../../shared/infrastructure/queues/QueueRegistry.js')
  await Queues.bankScrape.add('scrape', { accountId: req.params.accountId })
  res.status(202).json({ queued: true })
})

accountsRouter.put('/:accountId/config', async (req, res) => {
  const { accountId } = req.params
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
    mode,
  } = req.body

  const normalizedMode: AccountMode = mode === 'passthrough' ? 'passthrough' : 'reconcile'
  const normalizedPendingEndpoint =
    typeof pending_orders_endpoint === 'string' && pending_orders_endpoint.trim()
      ? pending_orders_endpoint.trim()
      : null

  if (!webhook_url) {
    res.status(400).json({ error: 'webhook_url is required' })
    return
  }
  if (normalizedMode === 'reconcile' && !normalizedPendingEndpoint) {
    res.status(400).json({ error: 'pending_orders_endpoint is required when mode is reconcile' })
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

  const previous = await configRepo.findByAccountId(accountId)

  const config = await configRepo.upsert({
    accountId,
    mode: normalizedMode,
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
  })

  const switchingToPassthrough =
    normalizedMode === 'passthrough' && (!previous || previous.mode !== 'passthrough')
  if (switchingToPassthrough) {
    await bankTxRepo.markAllNotified(accountId)
  }

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

accountsRouter.get('/:accountId/movements', async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500)
  const offset = Number(req.query.offset ?? 0)
  const { rows } = await db.query(
    `SELECT id, external_id, amount, currency, sender_name, received_at, notified_at, excluded_at
       FROM bank_transactions
      WHERE account_id = $1
      ORDER BY received_at DESC
      LIMIT $2 OFFSET $3`,
    [req.params.accountId, limit, offset]
  )
  res.json(rows)
})

accountsRouter.post('/:accountId/movements/:movementId/notify', async (req, res) => {
  const { accountId, movementId } = req.params
  const { rows } = await db.query(
    `SELECT 1 FROM bank_transactions WHERE id = $1 AND account_id = $2`,
    [movementId, accountId]
  )
  if (rows.length === 0) {
    res.status(404).json({ error: 'Movement not found for this account' })
    return
  }

  await bankTxRepo.releaseNotification(movementId)

  const { Queues } = await import('../../shared/infrastructure/queues/QueueRegistry.js')
  await Queues.bankMovementWebhook.add(
    'notify',
    { bankTransactionId: movementId },
    { jobId: `bank-movement-webhook_${movementId}_${Date.now()}`, removeOnComplete: true }
  )
  res.status(202).json({ queued: true })
})
