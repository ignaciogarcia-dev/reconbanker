import { IUserRepository } from '../domain/IUserRepository.js'
import { ITotpProvider } from '../domain/ports/ITotpProvider.js'
import { IBackupCodeRepository } from '../domain/IBackupCodeRepository.js'
import { IPasswordHasher } from '../domain/ports/IPasswordHasher.js'
import { IUnitOfWork } from '../../../shared/persistence/IUnitOfWork.js'
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../../shared/errors/index.js'
import { generateBackupCodes, normalizeBackupCode } from './backupCodes.js'

interface Input {
  userId: string
  code: string
}

interface Output {
  /** Plaintext backup codes — returned once and never retrievable again. */
  backupCodes: string[]
}

/**
 * Confirms enrollment by verifying a TOTP code against the pending secret, then
 * enables 2FA and issues a fresh set of one-time backup codes.
 */
export class ConfirmTotpEnrollmentUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly totp: ITotpProvider,
    private readonly backupCodes: IBackupCodeRepository,
    private readonly hasher: IPasswordHasher,
    private readonly unitOfWork: IUnitOfWork,
  ) {}

  async execute(input: Input): Promise<Output> {
    const user = await this.userRepo.findById(input.userId)
    if (!user) throw new NotFoundError('User not found')
    if (user.isTotpEnabled()) throw new ConflictError('2FA is already enabled')
    if (!user.totpSecret) throw new ValidationError('No enrollment in progress')

    const { valid, timeStep } = await this.totp.verify(user.totpSecret, input.code)
    if (!valid) throw new UnauthorizedError('Invalid code')

    user.confirmTotp()
    // Consume the verified step now so this same code can't be replayed at the
    // user's first login (verifyTwoFactorCode rejects steps <= totpLastStep).
    if (timeStep !== undefined) user.recordTotpStep(timeStep)

    const codes = generateBackupCodes()
    const hashes = await Promise.all(
      codes.map((c) => this.hasher.hash(normalizeBackupCode(c))),
    )

    // Enabling 2FA and writing the backup codes must be atomic: a partial
    // failure would otherwise leave 2FA enabled with no recovery codes.
    await this.unitOfWork.run(async (tx) => {
      await this.userRepo.withTx(tx).save(user)
      await this.backupCodes.withTx(tx).replaceForUser(user.id, hashes)
    })

    return { backupCodes: codes }
  }
}
