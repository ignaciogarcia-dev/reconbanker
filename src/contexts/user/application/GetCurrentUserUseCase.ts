import { IUserRepository } from '../domain/IUserRepository.js'
import { NotFoundError } from '../../../shared/errors/index.js'

interface Output {
  id: string
  email: string
  name: string | null
  operationMode: string | null
  totpEnabled: boolean
}

export class GetCurrentUserUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(userId: string): Promise<Output> {
    const user = await this.userRepo.findById(userId)
    if (!user) throw new NotFoundError('User not found')
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      operationMode: user.operationMode,
      totpEnabled: user.isTotpEnabled(),
    }
  }
}
