import { IAccountRepository } from '../domain/IAccountRepository.js'
import { NotFoundError, ValidationError } from '../../../shared/errors/index.js'

interface Input {
  id: string
  userId: string
  confirmationName: string
}

export class DeleteAccountUseCase {
  constructor(private readonly accountRepo: IAccountRepository) {}

  async execute(input: Input): Promise<void> {
    const account = await this.accountRepo.findByIdForUser(input.id, input.userId)
    if (!account) throw new NotFoundError('Account not found')
    if (account.name !== input.confirmationName.trim()) {
      throw new ValidationError('Confirmation name does not match')
    }
    await this.accountRepo.delete(input.id)
  }
}
