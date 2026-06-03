import { IUserRepository } from '../domain/IUserRepository.js'
import { ITotpProvider } from '../domain/ports/ITotpProvider.js'
import { IBackupCodeRepository } from '../domain/IBackupCodeRepository.js'
import { IPasswordHasher } from '../domain/ports/IPasswordHasher.js'
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
  ) {}

  async execute(input: Input): Promise<Output> {
    const user = await this.userRepo.findById(input.userId)
    if (!user) throw new NotFoundError('User not found')
    if (user.isTotpEnabled()) throw new ConflictError('2FA is already enabled')
    if (!user.totpSecret) throw new ValidationError('No enrollment in progress')

    const ok = await this.totp.verify(user.totpSecret, input.code)
    if (!ok) throw new UnauthorizedError('Invalid code')

    user.confirmTotp()
    await this.userRepo.save(user)

    const codes = generateBackupCodes()
    const hashes = await Promise.all(
      codes.map((c) => this.hasher.hash(normalizeBackupCode(c))),
    )
    await this.backupCodes.replaceForUser(user.id, hashes)

    return { backupCodes: codes }
  }
}
