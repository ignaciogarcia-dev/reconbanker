import crypto from 'crypto'
import { Account } from '../domain/Account.js'
import { IAccountRepository } from '../domain/IAccountRepository.js'
import { IBankRepository } from '../domain/IBankRepository.js'
import { NotFoundError } from '../../../shared/errors/index.js'

interface Input {
  userId: string
  bankId: string
  name: string
}

export class CreateAccountUseCase {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly bankRepo: IBankRepository,
  ) {}

  async execute(input: Input): Promise<{ id: string }> {
    const bank = await this.bankRepo.findById(input.bankId)
    if (!bank) throw new NotFoundError('Bank not found')

    const id = crypto.randomUUID()
    const account = Account.create(id, input.userId, bank.id, bank.code, input.name)
    await this.accountRepo.save(account)
    return { id }
  }
}
