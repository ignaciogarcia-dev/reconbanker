import { Router } from 'express'
import { z } from 'zod'
import { controller } from '../http/controller.js'
import { validateBody, validateParams } from '../http/validate.js'
import type { AccountModule } from '../../composition/accountModule.js'

const bankIdParams = z.object({ bankId: z.string().min(1) })

const createBankSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  loginUrl: z.string().optional(),
})

export function buildBanksRouter(account: AccountModule): Router {
  const router = Router()

  router.get('/', controller(async (_req, res) => {
    const banks = await account.listBanks.execute()
    res.json(banks)
  }))

  router.post('/', controller(async (req, res) => {
    const { code, name, loginUrl } = validateBody(req, createBankSchema)
    const result = await account.createBank.execute({ code, name, loginUrl })
    res.status(201).json(result)
  }))

  router.get('/:bankId', controller(async (req, res) => {
    const { bankId } = validateParams(req, bankIdParams)
    const detail = await account.getBankDetail.execute(bankId)
    res.json(detail)
  }))

  return router
}
