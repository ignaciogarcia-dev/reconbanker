import { Account } from '../../src/contexts/account/domain/Account.js'
import { Bank } from '../../src/contexts/account/domain/Bank.js'
import type { IAccountRepository } from '../../src/contexts/account/domain/IAccountRepository.js'
import type { IBankRepository } from '../../src/contexts/account/domain/IBankRepository.js'
import type {
  IAccountConfigRepository,
} from '../../src/contexts/account/domain/IAccountConfigRepository.js'
import type {
  AccountConfig,
  AccountConfigInput,
} from '../../src/contexts/account/domain/AccountConfig.js'
import type { IBankCredentialsRepository } from '../../src/contexts/account/domain/IBankCredentialsRepository.js'
import type {
  BankCredentialsInput,
  BankCredentialsRecord,
} from '../../src/contexts/account/domain/BankCredentials.js'

export class InMemoryAccountRepository implements IAccountRepository {
  store = new Map<string, Account>()
  withTx() { return this }
  async findById(id: string) { return this.store.get(id) ?? null }
  async findByIdForUser(id: string, userId: string) {
    const a = this.store.get(id)
    return a && a.userId === userId ? a : null
  }
  async findAllByUser(userId: string) {
    return [...this.store.values()].filter((a) => a.userId === userId && a.status === 'active')
  }
  async save(account: Account) { this.store.set(account.id, account) }
  async delete(id: string) { this.store.delete(id) }
  async clearScrapeBlock(_id: string) { /* no-op for in-memory tests */ }
}

export class InMemoryBankRepository implements IBankRepository {
  store = new Map<string, Bank>()
  withTx() { return this }
  async findById(id: string) { return this.store.get(id) ?? null }
  async findAll() { return [...this.store.values()] }
  async save(bank: Bank) { this.store.set(bank.id, bank) }
}

export class InMemoryAccountConfigRepository implements IAccountConfigRepository {
  store = new Map<string, AccountConfig>()
  withTx() { return this }
  async findByAccountId(accountId: string) { return this.store.get(accountId) ?? null }
  async upsert(input: AccountConfigInput): Promise<AccountConfig> {
    const existing = this.store.get(input.accountId)
    const config: AccountConfig = { id: existing?.id ?? `cfg-${input.accountId}`, ...input }
    this.store.set(input.accountId, config)
    return config
  }
}

export class InMemoryBankCredentialsRepository implements IBankCredentialsRepository {
  store = new Map<string, BankCredentialsRecord>()
  withTx() { return this }
  async findUsernameByAccount(accountId: string) {
    const rec = this.store.get(accountId)
    return rec?.status === 'valid' ? rec.username : null
  }
  async findByAccountId(accountId: string) { return this.store.get(accountId) ?? null }
  async upsert(input: BankCredentialsInput) {
    this.store.set(input.accountId, {
      accountId: input.accountId,
      username: input.username,
      status: 'valid',
      lastValidatedAt: new Date(),
    })
  }
  async deleteByAccountId(accountId: string) { this.store.delete(accountId) }
}
