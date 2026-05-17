export interface AccountForBanking {
  id: string
  userId: string
  bank: string
}

export interface IAccountForBankingReader {
  findById(accountId: string): Promise<AccountForBanking | null>
}
