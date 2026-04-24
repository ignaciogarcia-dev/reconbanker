import { IAccountRepository } from '../domain/IAccountRepository.js'

interface Input {
  id: string
  confirmationName: string
}

export class DeleteAccountUseCase {
  constructor(private readonly accountRepo: IAccountRepository) {}

  async execute(input: Input): Promise<void> {
    const account = await this.accountRepo.findById(input.id)
    if (!account) throw Object.assign(new Error('Account not found'), { status: 404 })
    if (account.name !== input.confirmationName) {
      throw Object.assign(new Error('Confirmation name does not match'), { status: 400 })
    }
    await this.accountRepo.delete(input.id)
  }
}
