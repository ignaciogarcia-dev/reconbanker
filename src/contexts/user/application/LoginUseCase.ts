import { IUserRepository } from '../domain/IUserRepository.js'
import { IPasswordHasher } from '../domain/ports/IPasswordHasher.js'
import { ITokenIssuer } from '../domain/ports/ITokenIssuer.js'
import { UnauthorizedError } from '../../../shared/errors/index.js'

interface Input {
  email: string
  password: string
}

interface SuccessOutput {
  token: string
  user: { id: string; email: string; name: string | null }
}

interface ChallengeOutput {
  requiresTotp: true
  challengeToken: string
}

export type LoginOutput = SuccessOutput | ChallengeOutput

/** Narrows a login result to the 2FA-challenge branch. */
export function isTotpChallenge(output: LoginOutput): output is ChallengeOutput {
  return 'requiresTotp' in output
}

/** Lifetime of the intermediate token issued between the password and TOTP steps. */
const CHALLENGE_TTL = '5m'

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenIssuer: ITokenIssuer,
  ) {}

  async execute(input: Input): Promise<LoginOutput> {
    const user = await this.userRepo.findByEmail(input.email)
    if (!user) throw new UnauthorizedError('Invalid credentials')

    const valid = await this.passwordHasher.verify(input.password, user.passwordHash)
    if (!valid) throw new UnauthorizedError('Invalid credentials')

    // 2FA-enabled users complete a second step instead of receiving a session token.
    if (user.isTotpEnabled()) {
      const challengeToken = this.tokenIssuer.issue(
        { sub: user.id, email: user.email, scope: '2fa_pending' },
        { expiresIn: CHALLENGE_TTL },
      )
      return { requiresTotp: true, challengeToken }
    }

    const token = this.tokenIssuer.issue({ sub: user.id, email: user.email })
    return { token, user: { id: user.id, email: user.email, name: user.name } }
  }
}
