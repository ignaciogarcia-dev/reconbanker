import { Router } from 'express'
import { db } from '../../shared/infrastructure/db/client.js'
import { AccountRepository } from '../../contexts/account/infrastructure/AccountRepository.js'
import { CreateAccountUseCase } from '../../contexts/account/application/CreateAccountUseCase.js'

export const accountsRouter = Router()
const repo = new AccountRepository()

// Listar cuentas
accountsRouter.get('/', async (_req, res) => {
  const accounts = await repo.findAll()
  res.json(accounts.map(a => ({ id: a.id, bank: a.bank, name: a.name, status: a.status })))
})

// Crear cuenta — body: { bankId: string, name: string }
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

// Obtener config de una cuenta
accountsRouter.get('/:accountId/config', async (req, res) => {
  const { rows: [config] } = await db.query(
    `SELECT ac.*, bc.username AS bank_username
       FROM account_config ac
       LEFT JOIN bank_credentials bc ON bc.account_id = ac.account_id AND bc.status = 'valid'
      WHERE ac.account_id = $1`,
    [req.params.accountId]
  )
  res.json(config ?? null)
})

// Disparar scrape manual
accountsRouter.post('/:accountId/scrape', async (req, res) => {
  const { Queues } = await import('../../shared/infrastructure/queues/QueueRegistry.js')
  await Queues.bankScrape.add('scrape', { accountId: req.params.accountId })
  res.status(202).json({ queued: true })
})

// Crear o actualizar config de una cuenta
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

  const normalizedMode = (mode === 'passthrough' ? 'passthrough' : 'reconcile') as 'reconcile' | 'passthrough'
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

  const RESERVED_WEBHOOK_KEYS = ['external_id', 'status', 'amount', 'currency', 'sender_name', 'payment_method_id', 'id', 'received_at']
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

  const normalizedPollingMethod = (polling_method ?? 'GET') as 'GET' | 'POST'

  let normalizedPollingBody: unknown = null
  if (normalizedPollingMethod === 'POST') {
    if (polling_body == null) {
      normalizedPollingBody = null
    } else if (typeof polling_body === 'string') {
      const trimmed = polling_body.trim()
      if (!trimmed) {
        normalizedPollingBody = null
      } else {
        try {
          normalizedPollingBody = JSON.parse(trimmed)
        } catch {
          res.status(400).json({ error: 'polling_body must be valid JSON (or empty)' })
          return
        }
      }
    } else {
      normalizedPollingBody = polling_body
    }
  }

  const normalizedAuthToken =
    typeof auth_token === 'string' && auth_token.trim() ? auth_token.trim() : null

  const normalizedWebhookAuthToken =
    typeof webhook_auth_token === 'string' && webhook_auth_token.trim() ? webhook_auth_token.trim() : null

  const { rows: [previous] } = await db.query(
    `SELECT mode FROM account_config WHERE account_id = $1`,
    [accountId]
  )

  const { rows: [config] } = await db.query(
    `INSERT INTO account_config
       (id, account_id, pending_orders_endpoint, webhook_url,
        retry_limit, polling_method, polling_body, auth_type, auth_token,
        webhook_auth_type, webhook_auth_token, notify_on_expired, webhook_extra_fields, mode)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (account_id) DO UPDATE SET
       pending_orders_endpoint = $2,
       webhook_url             = $3,
       retry_limit             = $4,
       polling_method          = $5,
       polling_body            = $6,
       auth_type               = $7,
       auth_token              = $8,
       webhook_auth_type       = $9,
       webhook_auth_token      = $10,
       notify_on_expired       = $11,
       webhook_extra_fields    = $12,
       mode                    = $13,
       updated_at              = now()
     RETURNING *`,
    [
      accountId, normalizedPendingEndpoint, webhook_url,
      retry_limit ?? 3,
      normalizedPollingMethod, normalizedPollingBody,
      auth_type ?? 'bearer', normalizedAuthToken,
      webhook_auth_type ?? null, normalizedWebhookAuthToken,
      notify_on_expired ?? false,
      normalizedWebhookExtraFields,
      normalizedMode,
    ]
  )

  const switchingToPassthrough =
    normalizedMode === 'passthrough' && (!previous || previous.mode !== 'passthrough')
  if (switchingToPassthrough) {
    await db.query(
      `UPDATE bank_transactions SET notified_at = now()
        WHERE account_id = $1 AND notified_at IS NULL`,
      [accountId]
    )
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

  res.json(config)
})
