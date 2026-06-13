import { Router } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middlewares/auth.middleware.js'
import { controller } from '../http/controller.js'
import { validateBody } from '../http/validate.js'
import { UnauthorizedError } from '../../shared/errors/index.js'
import { totpRateLimiter } from '../middlewares/rateLimit.middleware.js'
import type { UserModule } from '../../composition/userModule.js'

const operationModeSchema = z.object({
  mode: z.enum(['reconcile', 'passthrough']),
})

const totpCodeSchema = z.object({
  code: z.string().min(1).max(32),
})

const disableTotpSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(1).max(32),
})

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

export function buildUserRouter(user: UserModule): Router {
  const router = Router()

  router.get('/', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const me = await user.getCurrentUser.execute(userId)
    res.json({
      id: me.id,
      email: me.email,
      name: me.name,
      operation_mode: me.operationMode,
      totp_enabled: me.totpEnabled,
    })
  }))

  router.put('/operation-mode', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { mode } = validateBody(req, operationModeSchema)
    const result = await user.changeOperationMode.execute({ userId, mode })
    res.json({ operation_mode: result.mode })
  }))

  // Begin enrollment: returns the otpauth URI for the client to render as a QR code.
  router.post('/2fa/enroll', controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { otpauthUri } = await user.startTotpEnrollment.execute(userId)
    res.json({ otpauth_uri: otpauthUri })
  }))

  // Confirm enrollment with a code; returns one-time backup codes (shown once).
  router.post('/2fa/confirm', totpRateLimiter, controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { code } = validateBody(req, totpCodeSchema)
    const { backupCodes } = await user.confirmTotpEnrollment.execute({ userId, code })
    res.json({ backup_codes: backupCodes })
  }))

  // Disable 2FA: requires current password + a valid TOTP/backup code.
  router.delete('/2fa', totpRateLimiter, controller(async (req: AuthRequest, res) => {
    const userId = requireUserId(req)
    const { password, code } = validateBody(req, disableTotpSchema)
    await user.disableTotp.execute({ userId, password, code })
    res.status(204).end()
  }))

  return router
}
