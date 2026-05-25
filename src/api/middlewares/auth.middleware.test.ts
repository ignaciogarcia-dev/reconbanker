import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import type { Response, NextFunction } from 'express'
import {
  buildAuthMiddleware,
  authMiddleware,
  type AuthRequest,
} from './auth.middleware.js'
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'

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

  it('returns 401 when the Authorization header is missing', () => {
    const middleware = buildAuthMiddleware(tokenIssuer)
    const res = makeRes()
    middleware(makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
    expect(tokenIssuer.verify).not.toHaveBeenCalled()
  })

  it('returns 401 when the header does not start with "Bearer "', () => {
    const middleware = buildAuthMiddleware(tokenIssuer)
    const res = makeRes()
    middleware(makeReq({ authorization: 'Basic xyz' }), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 with "Invalid token" when verify returns null', () => {
    ;(tokenIssuer.verify as ReturnType<typeof vi.fn>).mockReturnValue(null)
    const middleware = buildAuthMiddleware(tokenIssuer)
    const res = makeRes()
    middleware(makeReq({ authorization: 'Bearer bad-token' }), res, next)

    expect(tokenIssuer.verify).toHaveBeenCalledWith('bad-token')
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' })
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches userId and calls next on a valid token', () => {
    ;(tokenIssuer.verify as ReturnType<typeof vi.fn>).mockReturnValue({
      sub: 'user-7',
      email: 'a@b.com',
    })
    const middleware = buildAuthMiddleware(tokenIssuer)
    const req = makeReq({ authorization: 'Bearer good-token' })
    const res = makeRes()
    middleware(req, res, next)

    expect(tokenIssuer.verify).toHaveBeenCalledWith('good-token')
    expect(req.userId).toBe('user-7')
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })
})

describe('authMiddleware (legacy)', () => {
  let next: NextFunction & ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'test-secret')
    next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>
  })

  it('returns 401 when the Authorization header is missing', () => {
    const res = makeRes()
    authMiddleware(makeReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when the header does not start with "Bearer "', () => {
    const res = makeRes()
    authMiddleware(makeReq({ authorization: 'Token abc' }), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 with "Invalid token" when the JWT is malformed', () => {
    const res = makeRes()
    authMiddleware(makeReq({ authorization: 'Bearer not-a-jwt' }), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 with "Invalid token" when the JWT is signed with a different secret', () => {
    const token = jwt.sign({ sub: 'user-42' }, 'other-secret')
    const res = makeRes()
    authMiddleware(makeReq({ authorization: `Bearer ${token}` }), res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' })
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches userId and calls next on a valid token', () => {
    const token = jwt.sign({ sub: 'user-42' }, 'test-secret')
    const req = makeReq({ authorization: `Bearer ${token}` })
    const res = makeRes()
    authMiddleware(req, res, next)

    expect(req.userId).toBe('user-42')
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })
})
