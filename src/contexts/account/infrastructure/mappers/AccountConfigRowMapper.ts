import { AccountConfig, AuthType, PollingMethod } from '../../domain/AccountConfig.js'

export interface AccountConfigRow {
  id: string
  account_id: string
  pending_orders_endpoint: string | null
  webhook_url: string
  retry_limit: number
  polling_method: PollingMethod
  polling_body: Record<string, unknown> | null
  auth_type: AuthType
  auth_token: string | null
  webhook_auth_type: AuthType | null
  webhook_auth_token: string | null
  notify_on_expired: boolean
  webhook_extra_fields: Record<string, unknown> | null
  silent_ingestion: boolean | null
}

export const AccountConfigRowMapper = {
  toDto(row: AccountConfigRow): AccountConfig {
    return {
      id: row.id,
      accountId: row.account_id,
      pendingOrdersEndpoint: row.pending_orders_endpoint,
      webhookUrl: row.webhook_url,
      retryLimit: row.retry_limit,
      pollingMethod: row.polling_method,
      pollingBody: row.polling_body,
      authType: row.auth_type,
      authToken: row.auth_token,
      webhookAuthType: row.webhook_auth_type,
      webhookAuthToken: row.webhook_auth_token,
      notifyOnExpired: row.notify_on_expired,
      webhookExtraFields: row.webhook_extra_fields,
      silentIngestion: row.silent_ingestion ?? false,
    }
  },
}
