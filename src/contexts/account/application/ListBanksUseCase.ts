import { IBankRepository } from '../domain/IBankRepository.js'
import { BankSummaryDto } from './dto/BankDto.js'

export class ListBanksUseCase {
  constructor(private readonly bankRepo: IBankRepository) {}

  async execute(): Promise<BankSummaryDto[]> {
    const banks = await this.bankRepo.findAll()
    return banks.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      loginUrl: b.loginUrl ?? null,
      status: b.status,
    }))
  }
}
