import { httpClient } from '@/shared/http/client'
import type { AccountConfig, UpsertAccountConfigInput } from '../types'

interface AccountConfigRow {
  id: string
  account_id: string
  pending_orders_endpoint: string | null
  webhook_url: string
  retry_limit: number
  polling_method: AccountConfig['pollingMethod']
  polling_body: Record<string, unknown> | null
  auth_type: AccountConfig['authType']
  auth_token: string | null
  webhook_auth_type: AccountConfig['webhookAuthType']
  webhook_auth_token: string | null
  notify_on_expired: boolean
  webhook_extra_fields: Record<string, unknown> | null
  silent_ingestion: boolean
  bank_username: string | null
}

export async function getAccountConfig(accountId: string): Promise<AccountConfig | null> {
  const { data } = await httpClient.get<AccountConfigRow | null>(`/accounts/${accountId}/config`)
  return data ? toAccountConfig(data) : null
}

export async function upsertAccountConfig(
  accountId: string,
  input: UpsertAccountConfigInput
): Promise<AccountConfig> {
  const { data } = await httpClient.put<AccountConfigRow>(
    `/accounts/${accountId}/config`,
    toBackendBody(input)
  )
  return toAccountConfig(data)
}

function toAccountConfig(row: AccountConfigRow): AccountConfig {
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
    silentIngestion: row.silent_ingestion,
    bankUsername: row.bank_username,
  }
}

function toBackendBody(input: UpsertAccountConfigInput) {
  return {
    pending_orders_endpoint: input.pendingOrdersEndpoint,
    webhook_url: input.webhookUrl,
    retry_limit: input.retryLimit,
    polling_method: input.pollingMethod,
    polling_body: input.pollingBody,
    auth_type: input.authType,
    auth_token: input.authToken,
    webhook_auth_type: input.webhookAuthType,
    webhook_auth_token: input.webhookAuthToken,
    notify_on_expired: input.notifyOnExpired,
    webhook_extra_fields: input.webhookExtraFields,
    silent_ingestion: input.silentIngestion,
    bank_username: input.bankUsername,
    bank_password: input.bankPassword,
  }
}
