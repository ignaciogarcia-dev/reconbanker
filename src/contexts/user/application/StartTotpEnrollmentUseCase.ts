import { IUserRepository } from '../domain/IUserRepository.js'
import { ITotpProvider } from '../domain/ports/ITotpProvider.js'
import { ConflictError, NotFoundError } from '../../../shared/errors/index.js'

interface Output {
  otpauthUri: string
}

/**
 * Begins TOTP enrollment: generates and stores a pending secret, returning the
 * otpauth:// URI the client renders as a QR code. 2FA stays disabled until the
 * user confirms a code (ConfirmTotpEnrollmentUseCase).
 */
export class StartTotpEnrollmentUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly totp: ITotpProvider,
  ) {}

  async execute(userId: string): Promise<Output> {
    const user = await this.userRepo.findById(userId)
    if (!user) throw new NotFoundError('User not found')
    if (user.isTotpEnabled()) throw new ConflictError('2FA is already enabled')

    const secret = this.totp.generateSecret()
    user.beginTotpEnrollment(secret)
    await this.userRepo.save(user)

    return { otpauthUri: this.totp.keyUri(secret, user.email) }
  }
}
