import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { buildLogoutRouter } from './auth.routes.js'
import type { AuthRequest } from '../middlewares/auth.middleware.js'
import type { ITokenDenylist } from '../../contexts/user/domain/ports/ITokenDenylist.js'

function appWith(denylist: ITokenDenylist | undefined, token?: { jti?: string; exp?: number }) {
  const app = express()
  app.use(express.json())
  // Stand-in auth middleware that attaches the token like the real one does.
  app.use((req: AuthRequest, _res, next) => { req.token = token; next() })
  app.use('/logout', buildLogoutRouter(denylist))
  return app
}

describe('buildLogoutRouter', () => {
  it('revokes the current token and returns 204', async () => {
    const denylist: ITokenDenylist = { revoke: vi.fn().mockResolvedValue(undefined), isRevoked: vi.fn() }
    const res = await request(appWith(denylist, { jti: 'jti-1', exp: 1999999999 })).post('/logout')

    expect(res.status).toBe(204)
    expect(denylist.revoke).toHaveBeenCalledWith('jti-1', 1999999999)
  })

  it('returns 204 without revoking when there is no denylist configured', async () => {
    const res = await request(appWith(undefined, { jti: 'jti-1', exp: 1999999999 })).post('/logout')
    expect(res.status).toBe(204)
  })

  it('returns 204 without revoking when the token has no jti/exp', async () => {
    const denylist: ITokenDenylist = { revoke: vi.fn(), isRevoked: vi.fn() }
    const res = await request(appWith(denylist, {})).post('/logout')

    expect(res.status).toBe(204)
    expect(denylist.revoke).not.toHaveBeenCalled()
  })
})
