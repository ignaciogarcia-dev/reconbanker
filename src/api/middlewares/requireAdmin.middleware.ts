import { Response, NextFunction, RequestHandler } from 'express'
import type { AuthRequest } from './auth.middleware.js'

export interface RoleReader {
  getRole(userId: string): Promise<string | null>
}

/**
 * Authorization guard for global/admin-only resources (creating banks,
 * promoting scripts). Must run after the auth middleware that sets req.userId.
 */
export function buildRequireAdmin(roleReader: RoleReader): RequestHandler {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
      return
    }
    try {
      const role = await roleReader.getRole(req.userId)
      if (role !== 'admin') {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
        return
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
