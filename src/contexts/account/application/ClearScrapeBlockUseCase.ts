import { IAccountRepository } from '../domain/IAccountRepository.js'
import { NotFoundError } from '../../../shared/errors/index.js'

/**
 * Clears an account's fatal scrape/session block so it resumes automatic
 * triggers. Verifies ownership first. Used by the "restart" endpoint.
 */
export class ClearScrapeBlockUseCase {
  constructor(private readonly accountRepo: IAccountRepository) {}

  async execute(accountId: string, userId: string): Promise<void> {
    const account = await this.accountRepo.findByIdForUser(accountId, userId)
    if (!account) throw new NotFoundError('Account not found')
    await this.accountRepo.clearScrapeBlock(accountId)
  }
}
