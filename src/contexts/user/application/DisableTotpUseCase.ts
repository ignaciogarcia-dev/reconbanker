import { IUserRepository } from '../domain/IUserRepository.js'
import { IPasswordHasher } from '../domain/ports/IPasswordHasher.js'
import { IBackupCodeRepository } from '../domain/IBackupCodeRepository.js'
import { IUnitOfWork } from '../../../shared/persistence/IUnitOfWork.js'
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../shared/errors/index.js'
import { verifyTwoFactorCode, TwoFactorDeps } from './verifyTwoFactorCode.js'

interface Input {
  userId: string
  password: string
  code: string
}

/**
 * Disables 2FA. Requires re-proving identity with both the current password and
 * a valid TOTP/backup code, then clears the secret and all backup codes.
 */
export class DisableTotpUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly backupCodes: IBackupCodeRepository,
    private readonly twoFactor: TwoFactorDeps,
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(input: Input): Promise<void> {
    const user = await this.userRepo.findById(input.userId)
    if (!user) throw new NotFoundError('User not found')
    if (!user.isTotpEnabled()) throw new ValidationError('2FA is not enabled')

    const passwordOk = await this.passwordHasher.verify(input.password, user.passwordHash)
    if (!passwordOk) throw new UnauthorizedError('Invalid credentials')

    const codeOk = await verifyTwoFactorCode(user, input.code, this.twoFactor)
    if (!codeOk) throw new UnauthorizedError('Invalid code')

    user.disableTotp()
    // Clearing the secret and deleting backup codes must be atomic so we never
    // leave stale recovery codes behind a disabled 2FA.
    await this.unitOfWork.run(async (tx) => {
      await this.userRepo.withTx(tx).save(user)
      await this.backupCodes.withTx(tx).deleteForUser(user.id)
    })
  }
}
