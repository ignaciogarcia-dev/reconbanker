export interface PollingConfig {
  accountId: string
  pendingOrdersEndpoint: string | null
  pollingMethod: 'GET' | 'POST'
  pollingBody?: unknown
  authType: 'bearer' | 'api_key' | null
  authToken: string | null
}

export interface WebhookConfig {
  accountId: string
  webhookUrl: string | null
  webhookAuthType: 'bearer' | 'api_key' | null
  webhookAuthToken: string | null
  authType: 'bearer' | 'api_key' | null
  authToken: string | null
  webhookExtraFields: unknown
  notifyOnExpired: boolean
}

export interface IAccountConfigReader {
  findPollingConfig(accountId: string): Promise<PollingConfig | null>
  findWebhookConfigForRequest(requestId: string): Promise<WebhookConfig | null>
  shouldNotifyOnExpired(accountId: string): Promise<boolean>
}
