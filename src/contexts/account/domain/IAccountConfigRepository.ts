import { AccountConfig, AccountConfigInput } from './AccountConfig.js'

export interface IAccountConfigRepository {
  findByAccountId(accountId: string): Promise<AccountConfig | null>
  upsert(input: AccountConfigInput): Promise<AccountConfig>
}
