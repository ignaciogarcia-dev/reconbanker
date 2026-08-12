import { Router } from 'express'
import { z } from 'zod'
import { controller } from '../http/controller.js'
import { validateParams } from '../http/validate.js'
import type { ScriptEngineModule } from '../../composition/scriptEngineModule.js'
import type { AuthRequest } from '../middlewares/auth.middleware.js'
import { UnauthorizedError } from '../../shared/errors/index.js'

const scriptIdParams = z.object({ scriptId: z.string().uuid() })

function requireUserId(req: AuthRequest): string {
  if (!req.userId) throw new UnauthorizedError('Unauthorized')
  return req.userId
}

export function buildScriptsRouter(scriptEngine: ScriptEngineModule): Router {
  const router = Router()

  router.get('/', controller(async (req: AuthRequest, res) => {
    const scripts = await scriptEngine.listScripts.execute({ callerId: requireUserId(req) })
    res.json(scripts)
  }))

  router.get('/:scriptId', controller(async (req: AuthRequest, res) => {
    const { scriptId } = validateParams(req, scriptIdParams)
    const detail = await scriptEngine.getScriptDetail.execute({ scriptId, callerId: requireUserId(req) })
    res.json(detail)
  }))

  router.post('/:scriptId/promote', controller(async (req: AuthRequest, res) => {
    const { scriptId } = validateParams(req, scriptIdParams)
    await scriptEngine.promoteScript.execute({ scriptId, callerId: requireUserId(req) })
    res.json({ promoted: true })
  }))

  router.post('/:scriptId/deprecate', controller(async (req: AuthRequest, res) => {
    const { scriptId } = validateParams(req, scriptIdParams)
    await scriptEngine.deprecateScript.execute({ scriptId, callerId: requireUserId(req) })
    res.json({ deprecated: true })
  }))

  return router
}
