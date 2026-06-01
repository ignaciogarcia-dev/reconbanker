import { Router } from 'express'
import type { RequestHandler } from 'express'
import { z } from 'zod'
import { controller } from '../http/controller.js'
import { validateParams } from '../http/validate.js'
import type { ScriptEngineModule } from '../../composition/scriptEngineModule.js'

const scriptIdParams = z.object({ scriptId: z.string().uuid() })

export function buildScriptsRouter(scriptEngine: ScriptEngineModule, requireAdmin: RequestHandler): Router {
  const router = Router()

  router.get('/', controller(async (_req, res) => {
    const scripts = await scriptEngine.listScripts.execute()
    res.json(scripts)
  }))

  router.get('/:scriptId', controller(async (req, res) => {
    const { scriptId } = validateParams(req, scriptIdParams)
    const detail = await scriptEngine.getScriptDetail.execute(scriptId)
    res.json(detail)
  }))

  router.post('/:scriptId/promote', requireAdmin, controller(async (req, res) => {
    const { scriptId } = validateParams(req, scriptIdParams)
    await scriptEngine.promoteScript.execute({ scriptId })
    res.json({ promoted: true })
  }))

  return router
}
