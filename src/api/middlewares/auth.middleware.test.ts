import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Response, NextFunction } from 'express'
import { buildAuthMiddleware, type AuthRequest } from './auth.middleware.js'
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'
import type { ITokenDenylist } from '../../contexts/user/domain/ports/ITokenDenylist.js'

function makeRes() {
  const res = {} as Response
  ;(res as unknown as { status: ReturnType<typeof vi.fn> }).status = vi
    .fn()
    .mockReturnValue(res)
  ;(res as unknown as { json: ReturnType<typeof vi.fn> }).json = vi
    .fn()
    .mockReturnValue(res)
  return res as Response & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  }
}

function makeReq(headers: Record<string, string> = {}): AuthRequest {
  return { headers } as unknown as AuthRequest
}

describe('buildAuthMiddleware', () => {
  let tokenIssuer: ITokenIssuer
  let next: NextFunction & ReturnType<typeof vi.fn>

  beforeEach(() => {
    tokenIssuer = {
      issue: vi.fn().mockReturnValue('issued'),
      verify: vi.fn(),
    }
    next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>
  })

  it('returns 401 when the Authorization header is missing', async () => {
    const middleware = buildAuthMiddleware(tokenIssuer)
    const res = makeRes()
    await middleware(makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    expect(next).not.toHaveBeenCalled()
    expect(tokenIssuer.verify).not.toHaveBeenCalled()
  })

  it('returns 401 when the header does not start with "Bearer "', async () => {
    const middleware = buildAuthMiddleware(tokenIssuer)
    const res = makeRes()
    await middleware(makeReq({ authorization: 'Basic xyz' }), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 with "Invalid token" when verify returns null', async () => {
    ;(tokenIssuer.verify as ReturnType<typeof vi.fn>).mockReturnValue(null)
    const middleware = buildAuthMiddleware(tokenIssuer)
    const res = makeRes()
    await middleware(makeReq({ authorization: 'Bearer bad-token' }), res, next)

    expect(tokenIssuer.verify).toHaveBeenCalledWith('bad-token')
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } })
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches userId/token and calls next on a valid token', async () => {
    ;(tokenIssuer.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-7',
      email: 'a@b.com',
      jti: 'jti-1',
      exp: 123,
    })
    const middleware = buildAuthMiddleware(tokenIssuer)
    const req = makeReq({ authorization: 'Bearer good-token' })
    const res = makeRes()
    await middleware(req, res, next)

    expect(tokenIssuer.verify).toHaveBeenCalledWith('good-token')
    expect(req.userId).toBe('user-7')
    expect(req.token).toEqual({ jti: 'jti-1', exp: 123 })
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects a 2fa_pending challenge token with 401', async () => {
    ;(tokenIssuer.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-7',
      email: 'a@b.com',
      scope: '2fa_pending',
      jti: 'jti-1',
    })
    const middleware = buildAuthMiddleware(tokenIssuer)
    const req = makeReq({ authorization: 'Bearer challenge-token' })
    const res = makeRes()
    await middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } })
    expect(req.userId).toBeUndefined()
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a token with an unknown scope', async () => {
    ;(tokenIssuer.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-7', email: 'a@b.com', scope: 'something-else', jti: 'jti-1',
    })
    const middleware = buildAuthMiddleware(tokenIssuer)
    const res = makeRes()
    await middleware(makeReq({ authorization: 'Bearer weird' }), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } })
    expect(next).not.toHaveBeenCalled()
  })

  it('treats a token without a scope claim as access (legacy tokens)', async () => {
    ;(tokenIssuer.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-7', email: 'a@b.com', jti: 'jti-1',
    })
    const middleware = buildAuthMiddleware(tokenIssuer)
    const req = makeReq({ authorization: 'Bearer legacy' })
    await middleware(req, makeRes(), next)

    expect(req.userId).toBe('user-7')
    expect(next).toHaveBeenCalledTimes(1)
  })

  describe('with a token denylist', () => {
    function denylist(revoked: boolean): ITokenDenylist {
      return { revoke: vi.fn(), isRevoked: vi.fn().mockResolvedValue(revoked) }
    }

    beforeEach(() => {
      ;(tokenIssuer.verify as ReturnType<typeof vi.fn>).mockReturnValue({
        sub: 'user-7',
        email: 'a@b.com',
        jti: 'jti-1',
      })
    })

    it('rejects a revoked token with 401', async () => {
      const middleware = buildAuthMiddleware(tokenIssuer, denylist(true))
      const res = makeRes()
      await middleware(makeReq({ authorization: 'Bearer good-token' }), res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } })
      expect(next).not.toHaveBeenCalled()
    })

    it('allows a non-revoked token', async () => {
      const middleware = buildAuthMiddleware(tokenIssuer, denylist(false))
      const req = makeReq({ authorization: 'Bearer good-token' })
      await middleware(req, makeRes(), next)

      expect(req.userId).toBe('user-7')
      expect(next).toHaveBeenCalledTimes(1)
    })

    it('forwards denylist errors to next', async () => {
      const err = new Error('redis down')
      const broken: ITokenDenylist = { revoke: vi.fn(), isRevoked: vi.fn().mockRejectedValue(err) }
      const middleware = buildAuthMiddleware(tokenIssuer, broken)
      await middleware(makeReq({ authorization: 'Bearer good-token' }), makeRes(), next)

      expect(next).toHaveBeenCalledWith(err)
    })
  })
})
