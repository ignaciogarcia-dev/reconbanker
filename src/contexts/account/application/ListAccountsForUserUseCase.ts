import { IAccountRepository } from '../domain/IAccountRepository.js'
import { AccountSummaryDto } from './dto/AccountDto.js'

export class ListAccountsForUserUseCase {
  constructor(private readonly accountRepo: IAccountRepository) {}

  async execute(userId: string): Promise<AccountSummaryDto[]> {
    const accounts = await this.accountRepo.findAllByUser(userId)
    return accounts.map((a) => ({
      id: a.id,
      bank: a.bank,
      name: a.name ?? null,
      status: a.status,
      scrapeBlockedAt: a.scrapeBlockedAt?.toISOString() ?? null,
      scrapeBlockedReason: a.scrapeBlockedReason,
    }))
  }
}
