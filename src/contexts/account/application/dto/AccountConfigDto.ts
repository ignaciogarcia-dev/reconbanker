import type { AccountConfig, AuthType, PollingMethod } from '../../domain/AccountConfig.js'

export interface AccountConfigDto extends AccountConfig {
  bankUsername: string | null
}

export interface UpsertAccountConfigInput {
  userId: string
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
  bankUsername: string | null
  bankPassword: string | null
}
