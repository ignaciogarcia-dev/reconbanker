import { Account } from '../domain/Account.js'
import { IAccountRepository } from '../domain/IAccountRepository.js'
import { IBankRepository } from '../domain/IBankRepository.js'
import { BankRepository } from '../infrastructure/BankRepository.js'
import crypto from 'crypto'

interface Input {
  userId: string
  bankId: string
  name: string
}

export class CreateAccountUseCase {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly bankRepo: IBankRepository = new BankRepository(),
  ) {}

  async execute(input: Input): Promise<{ id: string }> {
    const bank = await this.bankRepo.findById(input.bankId)
    if (!bank) throw Object.assign(new Error('Bank not found'), { status: 404 })

    const id = crypto.randomUUID()
    const account = Account.create(id, input.userId, bank.id, bank.code, input.name)
    await this.accountRepo.save(account)
    return { id }
  }
}
