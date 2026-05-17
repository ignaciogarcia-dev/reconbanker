export interface BankMovementNotificationConfig {
  accountId: string
  webhookUrl: string | null
  webhookAuthType: 'bearer' | 'api_key' | null
  webhookAuthToken: string | null
  authType: 'bearer' | 'api_key' | null
  authToken: string | null
  webhookExtraFields: unknown
  silentIngestion: boolean
}

export interface INotificationConfigReader {
  findByAccountId(accountId: string): Promise<BankMovementNotificationConfig | null>
}
