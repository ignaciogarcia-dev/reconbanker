import type pg from 'pg'
import type { Redis } from 'ioredis'
import type { ILogger } from '../shared/logger/ILogger.js'
import type { IEventBus } from '../shared/events/IEventBus.js'
import type { IUnitOfWork } from '../shared/persistence/IUnitOfWork.js'
import { executorFromPool } from '../contexts/user/infrastructure/Executor.js'
import { UserRepository } from '../contexts/user/infrastructure/UserRepository.js'
import { BackupCodeRepository } from '../contexts/user/infrastructure/BackupCodeRepository.js'
import { BcryptPasswordHasher } from '../contexts/user/infrastructure/adapters/BcryptPasswordHasher.js'
import { JwtTokenIssuer } from '../contexts/user/infrastructure/adapters/JwtTokenIssuer.js'
import { OtplibTotpProvider } from '../contexts/user/infrastructure/adapters/OtplibTotpProvider.js'
import { RedisTokenDenylist } from '../contexts/user/infrastructure/adapters/RedisTokenDenylist.js'
import { UserDataCleanerAdapter } from '../contexts/user/infrastructure/adapters/UserDataCleanerAdapter.js'
import { RegisterUserUseCase } from '../contexts/user/application/RegisterUserUseCase.js'
import { LoginUseCase } from '../contexts/user/application/LoginUseCase.js'
import { VerifyTotpLoginUseCase } from '../contexts/user/application/VerifyTotpLoginUseCase.js'
import { StartTotpEnrollmentUseCase } from '../contexts/user/application/StartTotpEnrollmentUseCase.js'
import { ConfirmTotpEnrollmentUseCase } from '../contexts/user/application/ConfirmTotpEnrollmentUseCase.js'
import { DisableTotpUseCase } from '../contexts/user/application/DisableTotpUseCase.js'
import { GetCurrentUserUseCase } from '../contexts/user/application/GetCurrentUserUseCase.js'
import { ChangeOperationModeUseCase } from '../contexts/user/application/ChangeOperationModeUseCase.js'
import type { TwoFactorDeps } from '../contexts/user/application/verifyTwoFactorCode.js'
import type { ITokenIssuer } from '../contexts/user/domain/ports/ITokenIssuer.js'
import type { ITokenDenylist } from '../contexts/user/domain/ports/ITokenDenylist.js'

interface ContainerBase {
  pool: pg.Pool
  logger: ILogger
  eventBus: IEventBus
  unitOfWork: IUnitOfWork
  redis?: Redis
}

export interface UserModule {
  registerUser: RegisterUserUseCase
  login: LoginUseCase
  verifyTotpLogin: VerifyTotpLoginUseCase
  startTotpEnrollment: StartTotpEnrollmentUseCase
  confirmTotpEnrollment: ConfirmTotpEnrollmentUseCase
  disableTotp: DisableTotpUseCase
  getCurrentUser: GetCurrentUserUseCase
  changeOperationMode: ChangeOperationModeUseCase
  userRepository: UserRepository
  tokenIssuer: ITokenIssuer
  /** Present only when a Redis client is wired (runtime); enables logout/revocation. */
  tokenDenylist?: ITokenDenylist
}

export function buildUserModule(container: ContainerBase): UserModule {
  const exec = executorFromPool(container.pool)
  const userRepository = new UserRepository(exec)
  const backupCodeRepository = new BackupCodeRepository(exec)

  const passwordHasher = new BcryptPasswordHasher()
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required to build the user module')
  const tokenIssuer = new JwtTokenIssuer(secret)
  const totp = new OtplibTotpProvider()
  const twoFactor: TwoFactorDeps = { totp, backupCodes: backupCodeRepository, hasher: passwordHasher }
  const dataCleaner = new UserDataCleanerAdapter()
  const tokenDenylist = container.redis ? new RedisTokenDenylist(container.redis) : undefined

  return {
    userRepository,
    tokenIssuer,
    tokenDenylist,
    registerUser: new RegisterUserUseCase(userRepository, passwordHasher),
    login: new LoginUseCase(userRepository, passwordHasher, tokenIssuer),
    verifyTotpLogin: new VerifyTotpLoginUseCase(userRepository, tokenIssuer, twoFactor),
    startTotpEnrollment: new StartTotpEnrollmentUseCase(userRepository, totp),
    confirmTotpEnrollment: new ConfirmTotpEnrollmentUseCase(
      userRepository, totp, backupCodeRepository, passwordHasher
    ),
    disableTotp: new DisableTotpUseCase(
      userRepository, passwordHasher, backupCodeRepository, twoFactor
    ),
    getCurrentUser: new GetCurrentUserUseCase(userRepository),
    changeOperationMode: new ChangeOperationModeUseCase(
      userRepository, container.unitOfWork, dataCleaner, container.eventBus
    ),
  }
}
