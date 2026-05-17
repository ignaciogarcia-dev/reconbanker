import type { IAccountRepository } from '../../../account/domain/IAccountRepository.js'
import {
  IAccountForBankingReader,
  AccountForBanking,
} from '../../domain/ports/IAccountForBankingReader.js'

export class AccountForBankingReaderAdapter implements IAccountForBankingReader {
  constructor(private readonly accountRepo: IAccountRepository) {}

  async findById(accountId: string): Promise<AccountForBanking | null> {
    const account = await this.accountRepo.findById(accountId)
    if (!account) return null
    return { id: account.id, userId: account.userId, bank: account.bank }
  }
}
