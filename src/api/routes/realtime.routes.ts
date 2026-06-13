import { Router } from 'express'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { UnauthorizedError } from '../../shared/errors/index.js'
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'

const TICKET_TTL = `${Number(process.env.WS_TICKET_TTL_SECONDS ?? 30)}s`

// Issues a short-lived ws-scoped ticket that opens the WebSocket but never authorizes the REST API
export function buildRealtimeRouter(tokenIssuer: ITokenIssuer): Router {
  const router = Router()

  router.post('/ticket', controller(async (req: AuthRequest, res) => {
    if (!req.userId) throw new UnauthorizedError('Unauthorized')
    const ticket = tokenIssuer.issue(
      { sub: req.userId, email: '', scope: 'ws' },
      { expiresIn: TICKET_TTL },
    )
    res.json({ ticket, ttl_seconds: Number(process.env.WS_TICKET_TTL_SECONDS ?? 30) })
  }))

  return router
}
