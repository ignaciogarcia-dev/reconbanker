import { IUserRepository } from '../domain/IUserRepository.js'
import { IPasswordHasher } from '../domain/ports/IPasswordHasher.js'
import { ITokenIssuer } from '../domain/ports/ITokenIssuer.js'
import { UnauthorizedError } from '../../../shared/errors/index.js'

interface Input {
  email: string
  password: string
}

interface Output {
  token: string
  user: { id: string; email: string; name: string | null }
}

export class LoginUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenIssuer: ITokenIssuer,
  ) {}

  async execute(input: Input): Promise<Output> {
    const user = await this.userRepo.findByEmail(input.email)
    if (!user) throw new UnauthorizedError('Invalid credentials')

    const valid = await this.passwordHasher.verify(input.password, user.passwordHash)
    if (!valid) throw new UnauthorizedError('Invalid credentials')

    const token = this.tokenIssuer.issue({ sub: user.id, email: user.email })
    return { token, user: { id: user.id, email: user.email, name: user.name } }
  }
}
