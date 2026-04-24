import { Account } from './Account.js'

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>
  findAll(): Promise<Account[]>
  save(account: Account): Promise<void>
  delete(id: string): Promise<void>
}
