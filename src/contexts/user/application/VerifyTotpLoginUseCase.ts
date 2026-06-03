import { IUserRepository } from '../domain/IUserRepository.js'
import { ITokenIssuer } from '../domain/ports/ITokenIssuer.js'
import { UnauthorizedError } from '../../../shared/errors/index.js'
import { verifyTwoFactorCode, TwoFactorDeps } from './verifyTwoFactorCode.js'

interface Input {
  challengeToken: string
  code: string
}

interface Output {
  token: string
  user: { id: string; email: string; name: string | null }
}

/** Second login step: exchanges a 2fa_pending challenge token + a valid code for a session token. */
export class VerifyTotpLoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenIssuer: ITokenIssuer,
    private readonly twoFactor: TwoFactorDeps,
  ) {}

  async execute(input: Input): Promise<Output> {
    const payload = this.tokenIssuer.verify(input.challengeToken)
    if (!payload || payload.scope !== '2fa_pending') {
      throw new UnauthorizedError('Invalid or expired challenge')
    }

    const user = await this.userRepo.findById(payload.sub)
    if (!user || !user.isTotpEnabled()) {
      throw new UnauthorizedError('Invalid or expired challenge')
    }

    const ok = await verifyTwoFactorCode(user, input.code, this.twoFactor)
    if (!ok) throw new UnauthorizedError('Invalid code')

    const token = this.tokenIssuer.issue({ sub: user.id, email: user.email })
    return { token, user: { id: user.id, email: user.email, name: user.name } }
  }
}
