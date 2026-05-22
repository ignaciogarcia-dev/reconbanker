export type AccountStatus = 'active' | 'inactive'
export type BankStatus = 'pending' | 'onboarding' | 'ready' | 'failed'
export type AuthType = 'bearer' | 'api_key'
export type PollingMethod = 'GET' | 'POST'
export type SessionType = 'one-shot' | 'persistent'
export type LoginMode = 'simple' | 'assisted'

export interface Bank {
  id: string
  code: string
  name: string
  loginUrl: string | null
  status: BankStatus
}

export interface Account {
  id: string
  bank: string
  name: string | null
  status: AccountStatus
  scrapeBlockedAt: string | null
  scrapeBlockedReason: string | null
}

export interface AccountConfig {
  id: string
  accountId: string
  pendingOrdersEndpoint: string | null
  webhookUrl: string
  retryLimit: number
  pollingMethod: PollingMethod
  pollingBody: Record<string, unknown> | null
  authType: AuthType
  authToken: string | null
  webhookAuthType: AuthType | null
  webhookAuthToken: string | null
  notifyOnExpired: boolean
  webhookExtraFields: Record<string, unknown> | null
  silentIngestion: boolean
  sessionType: SessionType
  loginMode: LoginMode
  bankUsername: string | null
}

export interface CreateAccountInput {
  bankId: string
  name: string
}

export interface UpsertAccountConfigInput
  extends Omit<AccountConfig, 'id' | 'accountId' | 'bankUsername'> {
  bankUsername: string | null
  bankPassword: string | null
}
