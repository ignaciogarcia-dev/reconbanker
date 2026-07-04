import { Account } from './Account.js'

// Live state of an account's persistent monitor session (null = no session row yet).
export type AccountSessionStatus = 'running' | 'stopped' | 'needs_attention'

// Lightweight list projection that also carries the current session status for the
// per-account dashboard light, without loading session state into the Account aggregate.
export interface AccountSummary {
  id: string
  bank: string
  name: string | null
  status: string
  sessionStatus: AccountSessionStatus | null
  assistedPersistent: boolean
}

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>
  findByIdForUser(id: string, userId: string): Promise<Account | null>
  findAllByUser(userId: string): Promise<Account[]>
  findSummariesByUser(userId: string): Promise<AccountSummary[]>
  save(account: Account): Promise<void>
  delete(id: string): Promise<void>
}
