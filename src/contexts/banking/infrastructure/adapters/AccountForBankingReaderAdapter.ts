import type { IAccountRepository } from '../../../account/domain/IAccountRepository.js'
import type { IAccountConfigRepository } from '../../../account/domain/IAccountConfigRepository.js'
import {
  IAccountForBankingReader,
  AccountForBanking,
} from '../../domain/ports/IAccountForBankingReader.js'

export class AccountForBankingReaderAdapter implements IAccountForBankingReader {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly configRepo: IAccountConfigRepository,
  ) {}

  async findById(accountId: string): Promise<AccountForBanking | null> {
    const account = await this.accountRepo.findById(accountId)
    if (!account) return null
    const config = await this.configRepo.findByAccountId(accountId)
    return {
      id: account.id,
      userId: account.userId,
      bank: account.bank,
      sessionType: config?.sessionType ?? 'one-shot',
      loginMode: config?.loginMode ?? 'simple',
    }
  }
}
