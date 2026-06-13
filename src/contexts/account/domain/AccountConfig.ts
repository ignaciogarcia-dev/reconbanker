export type AuthType = 'bearer' | 'api_key'
export type PollingMethod = 'GET' | 'POST'
export type SessionType = 'one-shot' | 'persistent'
export type LoginMode = 'simple' | 'assisted'

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
  // Endpoint for status and assistance events distinct from webhookUrl which carries transactions
  notificationEndpointUrl: string | null
  notificationAuthType: AuthType | null
  notificationAuthToken: string | null
  // Subscribed event types where null or empty means none
  notificationEvents: string[] | null
}

export interface AccountConfigInput {
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
}
