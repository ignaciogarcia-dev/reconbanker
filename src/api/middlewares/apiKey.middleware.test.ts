import { describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { buildApiKeyMiddleware, requireScope, type ApiKeyRequest } from './apiKey.middleware.js'
import type { ApiKeyPrincipal } from '../../contexts/user/domain/ApiKey.js'

function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown }
  res.status = vi.fn((code: number) => { res.statusCode = code; return res }) as never
  res.json = vi.fn((body: unknown) => { res.body = body; return res }) as never
  return res
}

function auth(result: ApiKeyPrincipal | null) {
  return { execute: vi.fn(async () => result) } as never
}

const PRINCIPAL: ApiKeyPrincipal = {
  keyId: 'k1', userId: 'u1', scopes: ['otp:write'], accountIds: ['acc-1'],
}

describe('buildApiKeyMiddleware', () => {
  it('401s when no key is presented', async () => {
    const res = mockRes()
    const next = vi.fn()
    await buildApiKeyMiddleware(auth(PRINCIPAL))({ headers: {} } as Request, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('401s on an invalid key', async () => {
    const res = mockRes()
    const next = vi.fn()
    const req = { headers: { authorization: 'Api-Key bad' } } as Request
    await buildApiKeyMiddleware(auth(null))(req, res, next)
    expect(res.statusCode).toBe(401)
  })

  it('attaches the principal and calls next on a valid key (Api-Key header)', async () => {
    const res = mockRes()
    const next = vi.fn()
    const req = { headers: { authorization: 'Api-Key rbk_x' } } as ApiKeyRequest
    await buildApiKeyMiddleware(auth(PRINCIPAL))(req, res, next)
    expect(req.apiKey).toEqual(PRINCIPAL)
    expect(next).toHaveBeenCalledOnce()
  })

  it('accepts the X-Api-Key header too', async () => {
    const res = mockRes()
    const next = vi.fn()
    const req = { headers: { 'x-api-key': 'rbk_x' } } as unknown as ApiKeyRequest
    await buildApiKeyMiddleware(auth(PRINCIPAL))(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('requireScope', () => {
  it('403s when the scope is missing', () => {
    const res = mockRes()
    const next = vi.fn()
    const req = { apiKey: { ...PRINCIPAL, scopes: ['status:read'] }, params: {} } as ApiKeyRequest
    requireScope('otp:write')(req, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('403s when the key is not allowed for the requested account', () => {
    const res = mockRes()
    const next = vi.fn()
    const req = { apiKey: PRINCIPAL, params: { accountId: 'acc-2' } } as unknown as ApiKeyRequest
    requireScope('otp:write')(req, res, next)
    expect(res.statusCode).toBe(403)
  })

  it('passes when scope and account allow-list match', () => {
    const res = mockRes()
    const next = vi.fn()
    const req = { apiKey: PRINCIPAL, params: { accountId: 'acc-1' } } as unknown as ApiKeyRequest
    requireScope('otp:write')(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('allows any account when account_ids is null (all)', () => {
    const res = mockRes()
    const next = vi.fn()
    const req = {
      apiKey: { ...PRINCIPAL, accountIds: null },
      params: { accountId: 'acc-anything' },
    } as unknown as ApiKeyRequest
    requireScope('otp:write')(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })
})
