import { Account } from './Account.js'

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>
  findByIdForUser(id: string, userId: string): Promise<Account | null>
  findAllByUser(userId: string): Promise<Account[]>
  save(account: Account): Promise<void>
  delete(id: string): Promise<void>
  clearScrapeBlock(id: string): Promise<void>
}
