export type SessionType = 'one-shot' | 'persistent'
export type LoginMode = 'simple' | 'assisted'

export interface AccountForBanking {
  id: string
  userId: string
  bank: string
  sessionType: SessionType
  loginMode: LoginMode
}

export interface IAccountForBankingReader {
  findById(accountId: string): Promise<AccountForBanking | null>
}
