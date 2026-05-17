import { BankCredentialsInput, BankCredentialsRecord } from './BankCredentials.js'

export interface IBankCredentialsRepository {
  findUsernameByAccount(accountId: string): Promise<string | null>
  findByAccountId(accountId: string): Promise<BankCredentialsRecord | null>
  upsert(input: BankCredentialsInput): Promise<void>
  deleteByAccountId(accountId: string): Promise<void>
}
