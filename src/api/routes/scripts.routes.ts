import { Router } from 'express'
import { db } from '../../shared/infrastructure/db/client.js'
import { PromoteScriptUseCase } from '../../contexts/script-engine/application/PromoteScriptUseCase.js'

export const scriptsRouter = Router()

scriptsRouter.get('/', async (_req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM bank_scripts ORDER BY bank, flow_type, created_at DESC`
  )
  res.json(rows)
})

scriptsRouter.get('/:scriptId', async (req, res) => {
  const { rows: [script] } = await db.query(
    `SELECT * FROM bank_scripts WHERE id = $1`,
    [req.params.scriptId]
  )
  if (!script) { res.status(404).json({ error: 'Not found' }); return }
  res.json(script)
})

scriptsRouter.post('/:scriptId/promote', async (req, res) => {
  const useCase = new PromoteScriptUseCase()
  await useCase.execute({ scriptId: req.params.scriptId })
  res.json({ promoted: true })
})
