import { Router } from 'express'
import { z } from 'zod'
import { controller } from '../http/controller.js'
import { validateBody } from '../http/validate.js'
import type { UserModule } from '../../composition/userModule.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  name: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export function buildAuthRouter(user: UserModule): Router {
  const router = Router()

  router.post('/register', controller(async (req, res) => {
    const { email, password, name } = validateBody(req, registerSchema)
    const result = await user.registerUser.execute({ email, password, name })
    res.status(201).json(result)
  }))

  router.post('/login', controller(async (req, res) => {
    const { email, password } = validateBody(req, loginSchema)
    const result = await user.login.execute({ email, password })
    res.json(result)
  }))

  return router
}
