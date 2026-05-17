import type { IAccountRepository } from '../../../account/domain/IAccountRepository.js'
import { IAccountReader, AccountSummary } from '../../domain/ports/IAccountReader.js'

export class AccountReaderAdapter implements IAccountReader {
  constructor(private readonly accountRepo: IAccountRepository) {}

  async findById(accountId: string): Promise<AccountSummary | null> {
    const account = await this.accountRepo.findById(accountId)
    if (!account) return null
    return { id: account.id, userId: account.userId }
  }
}
