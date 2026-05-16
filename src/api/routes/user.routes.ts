import { Router } from 'express'
import { UserRepository } from '../../contexts/user/infrastructure/UserRepository.js'
import { ChangeOperationModeUseCase } from '../../contexts/user/application/ChangeOperationModeUseCase.js'
import { OperationMode } from '../../contexts/user/domain/User.js'
import { AuthRequest } from '../middlewares/auth.middleware.js'

export const userRouter = Router()
const userRepo = new UserRepository()

userRouter.get('/', async (req: AuthRequest, res) => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  const user = await userRepo.findById(req.userId)
  if (!user) { res.status(404).json({ error: 'User not found' }); return }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    operation_mode: user.operationMode,
  })
})

userRouter.put('/operation-mode', async (req: AuthRequest, res) => {
  if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return }
  const { mode } = req.body
  if (mode !== 'reconcile' && mode !== 'passthrough') {
    res.status(400).json({ error: "mode must be 'reconcile' or 'passthrough'" })
    return
  }
  const useCase = new ChangeOperationModeUseCase()
  const result = await useCase.execute({ userId: req.userId, mode: mode as OperationMode })
  res.json({ operation_mode: result.mode })
})
