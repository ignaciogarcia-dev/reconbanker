export type AccountStatus = 'active' | 'inactive'
export type BankStatus = 'pending' | 'onboarding' | 'ready' | 'failed'
export type AuthType = 'bearer' | 'api_key'
export type PollingMethod = 'GET' | 'POST'
export type SessionType = 'one-shot' | 'persistent'
export type LoginMode = 'simple' | 'assisted'
export type NotificationTransport = 'api' | 'slack' | 'chat_webhook'
export type SessionStatus = 'running' | 'stopped' | 'needs_attention'

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
  // Live persistent-session status for the dashboard light; null when no session row yet.
  sessionStatus: SessionStatus | null
  // Persistent + assisted accounts never auto-launch; the list shows a manual start/reactivate button.
  assistedPersistent: boolean
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
  notificationEndpointUrl: string | null
  notificationAuthType: AuthType | null
  notificationAuthToken: string | null
  notificationEvents: string[] | null
  notificationTransport: NotificationTransport
  notificationSlackChannel: string | null
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
