import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { validateBody, validateParams } from '../http/validate.js'
import { expensiveActionRateLimiter } from '../middlewares/rateLimit.middleware.js'
import { UnauthorizedError, ValidationError } from '../../shared/errors/index.js'
import { enqueueBankScrape } from '../../shared/infrastructure/queues/BankScrapeQueue.js'
import type { AccountModule } from '../../composition/accountModule.js'
import type { AccountConfigDto } from '../../contexts/account/application/dto/AccountConfigDto.js'
import { SECRET_PRESENT_MASK } from '../../contexts/account/application/secretMask.js'

const accountIdParams = z.object({ accountId: z.string().uuid() })

const createAccountSchema = z.object({
  bankId: z.string().min(1),
  name: z.string().min(1),
})

const deleteAccountSchema = z.object({
  confirmation_name: z.string().min(1),
})

const upsertConfigSchema = z.object({
  pending_orders_endpoint: z.string().nullable().optional(),
  webhook_url: z.string().min(1),
  webhook_auth_type: z.enum(['bearer', 'api_key']).nullable().optional(),
  webhook_auth_token: z.string().nullable().optional(),
  retry_limit: z.number().int().nonnegative().optional(),
  polling_method: z.enum(['GET', 'POST']).optional(),
  polling_body: z.union([z.record(z.string(), z.unknown()), z.string()]).nullable().optional(),
  auth_type: z.enum(['bearer', 'api_key']).optional(),
  auth_token: z.string().nullable().optional(),
  bank_username: z.string().nullable().optional(),
  bank_password: z.string().nullable().optional(),
  notify_on_expired: z.boolean().optional(),
  webhook_extra_fields: z.union([z.record(z.string(), z.unknown()), z.string(), z.null()]).optional(),
  silent_ingestion: z.boolean().optional(),
  session_type: z.enum(['one-shot', 'persistent']).optional(),
  login_mode: z.enum(['simple', 'assisted']).optional(),
})

const RESERVED_WEBHOOK_KEYS = ['external_id', 'status', 'amount', 'currency', 'name', 'id', 'received_at']

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

function parseExtraFields(raw: unknown): Record<string, unknown> | null {
  if (raw == null || raw === '') return null
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) }
    catch { throw new ValidationError('webhook_extra_fields must be valid JSON') }
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError('webhook_extra_fields must be a JSON object')
  }
  const conflicts = Object.keys(parsed as object).filter((k) => RESERVED_WEBHOOK_KEYS.includes(k))
  if (conflicts.length > 0) {
    throw new ValidationError(`webhook_extra_fields cannot override reserved keys: ${conflicts.join(', ')}`)
  }
  return parsed as Record<string, unknown>
}

function parsePollingBody(method: string, raw: unknown): Record<string, unknown> | null {
  if (method !== 'POST') return null
  if (raw == null || raw === '') return null
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try { return JSON.parse(trimmed) as Record<string, unknown> }
    catch { throw new ValidationError('polling_body must be valid JSON (or empty)') }
  }
  // At this point raw must be a non-null, non-string value that passed the zod
  // schema (record | string | null | undefined), so it's a plain object.
  return raw as Record<string, unknown>
}

function toJson(config: AccountConfigDto) {
  return {
    id: config.id,
    account_id: config.accountId,
    pending_orders_endpoint: config.pendingOrdersEndpoint,
    webhook_url: config.webhookUrl,
    retry_limit: config.retryLimit,
    polling_method: config.pollingMethod,
    polling_body: config.pollingBody,
    auth_type: config.authType,
    // Never expose stored secrets; signal presence with a sentinel the client echoes back.
    auth_token: config.authToken ? SECRET_PRESENT_MASK : null,
    webhook_auth_type: config.webhookAuthType,
    webhook_auth_token: config.webhookAuthToken ? SECRET_PRESENT_MASK : null,
    notify_on_expired: config.notifyOnExpired,
    webhook_extra_fields: config.webhookExtraFields,
    silent_ingestion: config.silentIngestion,
    session_type: config.sessionType,
    login_mode: config.loginMode,
    bank_username: config.bankUsername,
  }
}

export function buildAccountsRouter(account: AccountModule): Router {
  const router = Router()

  router.get('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const accounts = await account.listAccountsForUser.execute(userId)
    res.json(accounts)
  }))

  router.post('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { bankId, name } = validateBody(req, createAccountSchema)
    const result = await account.createAccount.execute({ userId, bankId, name })
    res.status(201).json(result)
  }))

  router.get('/:accountId', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, accountIdParams)
    const detail = await account.getAccountDetail.execute(accountId, userId)
    res.json(detail)
  }))

  router.delete('/:accountId', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, accountIdParams)
    const { confirmation_name } = validateBody(req, deleteAccountSchema)
    await account.deleteAccount.execute({ id: accountId, userId, confirmationName: confirmation_name })
    res.status(204).end()
  }))

  router.get('/:accountId/config', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, accountIdParams)
    const config = await account.getAccountConfig.execute(accountId, userId)
    res.json(config ? toJson(config) : null)
  }))

  router.post('/:accountId/scrape', expensiveActionRateLimiter, controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, accountIdParams)
    await account.getAccountDetail.execute(accountId, userId) // ownership check
    const result = await enqueueBankScrape(accountId)
    res.status(202).json(result)
  }))

  router.put('/:accountId/config', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { accountId } = validateParams(req, accountIdParams)
    const body = validateBody(req, upsertConfigSchema)

    const method = body.polling_method === 'POST' ? 'POST' : 'GET'
    const config = await account.upsertAccountConfig.execute({
      userId, accountId,
      pendingOrdersEndpoint: body.pending_orders_endpoint ?? null,
      webhookUrl: body.webhook_url,
      retryLimit: body.retry_limit ?? 3,
      pollingMethod: method,
      pollingBody: parsePollingBody(method, body.polling_body),
      authType: body.auth_type ?? 'bearer',
      authToken: body.auth_token ?? null,
      webhookAuthType: body.webhook_auth_type ?? null,
      webhookAuthToken: body.webhook_auth_token ?? null,
      notifyOnExpired: body.notify_on_expired ?? false,
      webhookExtraFields: parseExtraFields(body.webhook_extra_fields),
      silentIngestion: body.silent_ingestion ?? false,
      sessionType: body.session_type ?? 'one-shot',
      loginMode: body.login_mode ?? 'simple',
      bankUsername: body.bank_username ?? null,
      bankPassword: body.bank_password ?? null,
    })

    res.json(toJson(config))
  }))

  return router
}
