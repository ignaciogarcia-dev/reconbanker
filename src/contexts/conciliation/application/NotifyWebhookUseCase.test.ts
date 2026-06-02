import { describe, it, expect, vi } from 'vitest'
import { NotifyWebhookUseCase } from './NotifyWebhookUseCase.js'
import { ConciliationRequest } from '../domain/ConciliationRequest.js'

function buildRequest(overrides: { status?: any; senderName?: string | undefined; explicitNoSender?: boolean } = {}) {
  const req = ConciliationRequest.reconstitute('req-1', {
    accountId: 'acc-1',
    externalId: 'ext-1',
    expectedAmount: 250,
    currency: 'USD',
    senderName: overrides.explicitNoSender ? undefined : (overrides.senderName ?? 'Alice'),
    status: overrides.status ?? 'matched',
    retryCount: 0,
    createdAt: new Date(),
  })
  return req
}

function buildDeps(opts: {
  request?: ConciliationRequest | null
  config?: any
  primary?: { id: string } | null
} = {}) {
  const requestRepo = {
    findById: vi.fn().mockResolvedValue(opts.request ?? null),
    findByIdForUpdate: vi.fn(),
    findActiveExternalIds: vi.fn(),
    findPendingByAccount: vi.fn(),
    findStale: vi.fn(),
    hasActiveRequests: vi.fn(),
    save: vi.fn(),
    cancelMissing: vi.fn(),
  }
  const matchRepo = {
    save: vi.fn(),
    findPrimaryByRequest: vi.fn().mockResolvedValue(opts.primary ?? null),
    markNotified: vi.fn().mockResolvedValue(undefined),
  }
  const configReader = {
    findPollingConfig: vi.fn(),
    findWebhookConfigForRequest: vi.fn().mockResolvedValue(opts.config ?? null),
    shouldNotifyOnExpired: vi.fn(),
  }
  const sendWebhookFn = vi.fn().mockResolvedValue({ status: 200, body: '' })
  const webhookLog = { record: vi.fn().mockResolvedValue(undefined) }
  return { requestRepo, matchRepo, configReader, webhookLog, sendWebhookFn }
}

describe('NotifyWebhookUseCase', () => {
  it('returns silently when request does not exist', async () => {
    const deps = buildDeps({ request: null })
    const useCase = new NotifyWebhookUseCase(deps as any)
    await useCase.execute({ requestId: 'missing' })
    expect(deps.configReader.findWebhookConfigForRequest).not.toHaveBeenCalled()
    expect(deps.sendWebhookFn).not.toHaveBeenCalled()
  })

  it('returns silently when status is not notifiable', async () => {
    const req = buildRequest({ status: 'pending' })
    const deps = buildDeps({ request: req })
    const useCase = new NotifyWebhookUseCase(deps as any)
    await useCase.execute({ requestId: 'req-1' })
    expect(deps.configReader.findWebhookConfigForRequest).not.toHaveBeenCalled()
    expect(deps.sendWebhookFn).not.toHaveBeenCalled()
  })

  it('returns silently when no config is found', async () => {
    const req = buildRequest({ status: 'matched' })
    const deps = buildDeps({ request: req, config: null })
    const useCase = new NotifyWebhookUseCase(deps as any)
    await useCase.execute({ requestId: 'req-1' })
    expect(deps.sendWebhookFn).not.toHaveBeenCalled()
  })

  it('returns silently when webhookUrl is null', async () => {
    const req = buildRequest({ status: 'matched' })
    const deps = buildDeps({
      request: req,
      config: { webhookUrl: null, webhookAuthToken: null, authToken: null, webhookAuthType: null, authType: null, webhookExtraFields: null },
    })
    const useCase = new NotifyWebhookUseCase(deps as any)
    await useCase.execute({ requestId: 'req-1' })
    expect(deps.sendWebhookFn).not.toHaveBeenCalled()
  })

  it('sends webhook and marks notified for matched status', async () => {
    const req = buildRequest({ status: 'matched' })
    const deps = buildDeps({
      request: req,
      config: {
        webhookUrl: 'https://hook.example/test',
        webhookAuthToken: ' primary-token ',
        authToken: 'fallback-token',
        webhookAuthType: 'api_key',
        authType: 'bearer',
        webhookExtraFields: { custom: 'value', external_id: 'should-not-override' },
      },
      primary: { id: 'match-1' },
    })
    const useCase = new NotifyWebhookUseCase(deps as any)

    await useCase.execute({ requestId: 'req-1' })

    expect(deps.sendWebhookFn).toHaveBeenCalledTimes(1)
    const callArg = deps.sendWebhookFn.mock.calls[0][0]
    expect(callArg.url).toBe('https://hook.example/test')
    expect(callArg.authType).toBe('api_key')
    expect(callArg.authToken).toBe('primary-token')
    expect(callArg.payload.external_id).toBe('ext-1')
    expect(callArg.payload.status).toBe('matched')
    expect(callArg.payload.amount).toBe(250)
    expect(callArg.payload.currency).toBe('USD')
    expect(callArg.payload.name).toBe('Alice')
    expect(callArg.payload.custom).toBe('value')
    expect(deps.matchRepo.findPrimaryByRequest).toHaveBeenCalledWith('req-1')
    expect(deps.matchRepo.markNotified).toHaveBeenCalledWith('match-1')
    expect(deps.webhookLog.record).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'acc-1',
      subjectType: 'conciliation_request',
      subjectId: 'req-1',
      responseStatus: 200,
      errorMessage: null,
      attempt: 1,
    }))
  })

  it('records a failure entry, does not mark notified, and rethrows', async () => {
    const req = buildRequest({ status: 'matched' })
    const deps = buildDeps({
      request: req,
      config: {
        webhookUrl: 'https://hook.example/x',
        webhookAuthToken: null, authToken: null,
        webhookAuthType: null, authType: null,
        webhookExtraFields: null,
      },
      primary: { id: 'match-1' },
    })
    const err = Object.assign(new Error('Webhook failed: 503'), { status: 503, body: 'down' })
    deps.sendWebhookFn.mockRejectedValue(err)
    const useCase = new NotifyWebhookUseCase(deps as any)

    await expect(useCase.execute({ requestId: 'req-1', attempt: 3 })).rejects.toThrow('Webhook failed: 503')
    expect(deps.webhookLog.record).toHaveBeenCalledWith(expect.objectContaining({
      subjectType: 'conciliation_request', subjectId: 'req-1',
      responseStatus: 503, responseBody: 'down', errorMessage: 'Webhook failed: 503',
      attempt: 3,
    }))
    expect(deps.matchRepo.markNotified).not.toHaveBeenCalled()
  })

  it('does not call matchRepo or markNotified for ambiguous status', async () => {
    const req = buildRequest({ status: 'ambiguous', explicitNoSender: true })
    const deps = buildDeps({
      request: req,
      config: {
        webhookUrl: 'https://hook.example/x',
        webhookAuthToken: null,
        authToken: null,
        webhookAuthType: null,
        authType: null,
        webhookExtraFields: null,
      },
    })
    const useCase = new NotifyWebhookUseCase(deps as any)
    await useCase.execute({ requestId: 'req-1' })
    expect(deps.matchRepo.findPrimaryByRequest).not.toHaveBeenCalled()
    expect(deps.matchRepo.markNotified).not.toHaveBeenCalled()
    expect(deps.sendWebhookFn).toHaveBeenCalledTimes(1)
    const callArg = deps.sendWebhookFn.mock.calls[0][0]
    expect(callArg.payload.name).toBeNull()
    expect(callArg.authToken).toBeNull()
    expect(callArg.authType).toBe('bearer')
  })

  it('does not call markNotified for expired even if status notifiable (no match returned)', async () => {
    const req = buildRequest({ status: 'expired' })
    const deps = buildDeps({
      request: req,
      config: {
        webhookUrl: 'https://hook.example/x',
        webhookAuthToken: null,
        authToken: '  fallback-token  ',
        webhookAuthType: null,
        authType: 'api_key',
        webhookExtraFields: null,
      },
    })
    const useCase = new NotifyWebhookUseCase(deps as any)
    await useCase.execute({ requestId: 'req-1' })
    expect(deps.matchRepo.findPrimaryByRequest).not.toHaveBeenCalled()
    expect(deps.matchRepo.markNotified).not.toHaveBeenCalled()
    const callArg = deps.sendWebhookFn.mock.calls[0][0]
    expect(callArg.authToken).toBe('fallback-token')
    expect(callArg.authType).toBe('api_key')
  })

  it('does not mark notified if matched but no primary match exists', async () => {
    const req = buildRequest({ status: 'matched' })
    const deps = buildDeps({
      request: req,
      config: {
        webhookUrl: 'https://hook.example/x',
        webhookAuthToken: '',
        authToken: '',
        webhookAuthType: null,
        authType: null,
        webhookExtraFields: null,
      },
      primary: null,
    })
    const useCase = new NotifyWebhookUseCase(deps as any)
    await useCase.execute({ requestId: 'req-1' })
    expect(deps.matchRepo.findPrimaryByRequest).toHaveBeenCalled()
    expect(deps.matchRepo.markNotified).not.toHaveBeenCalled()
    const callArg = deps.sendWebhookFn.mock.calls[0][0]
    expect(callArg.authToken).toBeNull()
  })

  it('skips extras when not a plain object (array)', async () => {
    const req = buildRequest({ status: 'ambiguous' })
    const deps = buildDeps({
      request: req,
      config: {
        webhookUrl: 'https://hook.example/x',
        webhookAuthToken: null,
        authToken: null,
        webhookAuthType: null,
        authType: null,
        webhookExtraFields: ['a', 'b'],
      },
    })
    const useCase = new NotifyWebhookUseCase(deps as any)
    await useCase.execute({ requestId: 'req-1' })
    const payload = deps.sendWebhookFn.mock.calls[0][0].payload
    expect(payload['0']).toBeUndefined()
    expect(Object.keys(payload).sort()).toEqual(['amount', 'currency', 'external_id', 'name', 'status'])
  })

  it('falls back to default sendWebhook when sendWebhookFn not provided', async () => {
    const req = buildRequest({ status: 'matched' })
    const deps = buildDeps({
      request: req,
      config: {
        webhookUrl: null,
        webhookAuthToken: null,
        authToken: null,
        webhookAuthType: null,
        authType: null,
        webhookExtraFields: null,
      },
    })
    const { sendWebhookFn, ...rest } = deps
    const useCase = new NotifyWebhookUseCase(rest as any)
    await expect(useCase.execute({ requestId: 'req-1' })).resolves.toBeUndefined()
  })
})
