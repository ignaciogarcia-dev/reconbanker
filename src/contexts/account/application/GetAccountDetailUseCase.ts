import { IAccountRepository } from '../domain/IAccountRepository.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import { AccountDetailDto } from './dto/AccountDto.js'

export class GetAccountDetailUseCase {
  constructor(private readonly accountRepo: IAccountRepository) {}

  async execute(accountId: string, userId: string): Promise<AccountDetailDto> {
    const account = await this.accountRepo.findByIdForUser(accountId, userId)
    if (!account) throw new NotFoundError('Account not found')
    return {
      id: account.id,
      bank: account.bank,
      name: account.name ?? null,
      status: account.status,
    }
  }
}
