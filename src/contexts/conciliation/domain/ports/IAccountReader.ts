export interface AccountSummary {
  id: string
  userId: string
}

export interface IAccountReader {
  findById(accountId: string): Promise<AccountSummary | null>
}
