import { Request, Response, NextFunction, RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'

export interface AuthRequest extends Request {
  userId?: string
}

/**
 * Container-driven auth middleware. Verifies the Bearer token through the
 * injected ITokenIssuer and attaches the user id to the request.
 */
export function buildAuthMiddleware(tokenIssuer: ITokenIssuer): RequestHandler {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
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
    req.userId = payload.sub
    next()
  }
}

/**
 * @deprecated Kept for callers that still import the singleton.
 * New code should use `buildAuthMiddleware(container.user.tokenIssuer)`.
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as { sub: string }
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
