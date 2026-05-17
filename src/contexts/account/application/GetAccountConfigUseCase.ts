import { IAccountRepository } from '../domain/IAccountRepository.js'
import { IAccountConfigRepository } from '../domain/IAccountConfigRepository.js'
import { IBankCredentialsRepository } from '../domain/IBankCredentialsRepository.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import { AccountConfigDto } from './dto/AccountConfigDto.js'

export class GetAccountConfigUseCase {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly configRepo: IAccountConfigRepository,
    private readonly credentialsRepo: IBankCredentialsRepository,
  ) {}

  async execute(accountId: string, userId: string): Promise<AccountConfigDto | null> {
    const account = await this.accountRepo.findByIdForUser(accountId, userId)
    if (!account) throw new NotFoundError('Account not found')
    const config = await this.configRepo.findByAccountId(accountId)
    if (!config) return null
    const bankUsername = await this.credentialsRepo.findUsernameByAccount(accountId)
    return { ...config, bankUsername }
  }
}
