import { Request, Response, NextFunction, RequestHandler } from 'express'
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'
import type { ITokenDenylist } from '../../contexts/user/domain/ports/ITokenDenylist.js'

export interface AuthRequest extends Request {
  userId?: string
  token?: { jti?: string; exp?: number }
}

/**
 * Container-driven auth middleware. Verifies the Bearer token through the
 * injected ITokenIssuer and attaches the user id to the request. When a
 * denylist is provided, revoked (logged-out) tokens are rejected.
 */
export function buildAuthMiddleware(
  tokenIssuer: ITokenIssuer,
  denylist?: ITokenDenylist,
): RequestHandler {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const payload = tokenIssuer.verify(header.slice(7))
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    // 2fa_pending challenge tokens only authorize the TOTP step, never the API.
    if ((payload.scope ?? 'access') !== 'access') {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    try {
      if (denylist && payload.jti && (await denylist.isRevoked(payload.jti))) {
        res.status(401).json({ error: 'Invalid token' })
        return
      }
    } catch (err) {
      next(err)
      return
    }
    req.userId = payload.sub
    req.token = { jti: payload.jti, exp: payload.exp }
    next()
  }
}
