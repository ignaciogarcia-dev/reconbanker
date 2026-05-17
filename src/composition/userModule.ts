import type pg from 'pg'
import type { ILogger } from '../shared/logger/ILogger.js'
import type { IEventBus } from '../shared/events/IEventBus.js'
import type { IUnitOfWork } from '../shared/persistence/IUnitOfWork.js'
import { executorFromPool } from '../contexts/user/infrastructure/Executor.js'
import { UserRepository } from '../contexts/user/infrastructure/UserRepository.js'
import { BcryptPasswordHasher } from '../contexts/user/infrastructure/adapters/BcryptPasswordHasher.js'
import { JwtTokenIssuer } from '../contexts/user/infrastructure/adapters/JwtTokenIssuer.js'
import { UserDataCleanerAdapter } from '../contexts/user/infrastructure/adapters/UserDataCleanerAdapter.js'
import { RegisterUserUseCase } from '../contexts/user/application/RegisterUserUseCase.js'
import { LoginUseCase } from '../contexts/user/application/LoginUseCase.js'
import { GetCurrentUserUseCase } from '../contexts/user/application/GetCurrentUserUseCase.js'
import { ChangeOperationModeUseCase } from '../contexts/user/application/ChangeOperationModeUseCase.js'
import type { ITokenIssuer } from '../contexts/user/domain/ports/ITokenIssuer.js'

interface ContainerBase {
  pool: pg.Pool
  logger: ILogger
  eventBus: IEventBus
  unitOfWork: IUnitOfWork
}

export interface UserModule {
  registerUser: RegisterUserUseCase
  login: LoginUseCase
  getCurrentUser: GetCurrentUserUseCase
  changeOperationMode: ChangeOperationModeUseCase
  userRepository: UserRepository
  tokenIssuer: ITokenIssuer
}

export function buildUserModule(container: ContainerBase): UserModule {
  const exec = executorFromPool(container.pool)
  const userRepository = new UserRepository(exec)

  const passwordHasher = new BcryptPasswordHasher()
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required to build the user module')
  const tokenIssuer = new JwtTokenIssuer(secret)
  const dataCleaner = new UserDataCleanerAdapter()

  return {
    userRepository,
    tokenIssuer,
    registerUser: new RegisterUserUseCase(userRepository, passwordHasher),
    login: new LoginUseCase(userRepository, passwordHasher, tokenIssuer),
    getCurrentUser: new GetCurrentUserUseCase(userRepository),
    changeOperationMode: new ChangeOperationModeUseCase(
      userRepository, container.unitOfWork, dataCleaner, container.eventBus
    ),
  }
}
