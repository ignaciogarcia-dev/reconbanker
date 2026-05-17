import crypto from 'crypto'
import { Bank } from '../domain/Bank.js'
import { IBankRepository } from '../domain/IBankRepository.js'

interface Input {
  code: string
  name: string
  loginUrl?: string
}

export class CreateBankUseCase {
  constructor(private readonly bankRepo: IBankRepository) {}

  async execute(input: Input): Promise<{ id: string }> {
    const bank = Bank.create(crypto.randomUUID(), input.code, input.name, input.loginUrl)
    await this.bankRepo.save(bank)
    return { id: bank.id }
  }
}
