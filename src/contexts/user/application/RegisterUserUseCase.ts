import crypto from 'crypto'
import { User } from '../domain/User.js'
import { IUserRepository } from '../domain/IUserRepository.js'
import { IPasswordHasher } from '../domain/ports/IPasswordHasher.js'
import { ConflictError } from '../../../shared/errors/index.js'

interface Input {
  email: string
  password: string
  name?: string | null
}

export class RegisterUserUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(input: Input): Promise<{ id: string; email: string }> {
    const existing = await this.userRepo.findByEmail(input.email)
    if (existing) throw new ConflictError('Email already exists', { email: input.email })

    const passwordHash = await this.passwordHasher.hash(input.password)
    const user = User.create(crypto.randomUUID(), input.email, passwordHash, input.name)
    await this.userRepo.save(user)
    return { id: user.id, email: user.email }
  }
}
