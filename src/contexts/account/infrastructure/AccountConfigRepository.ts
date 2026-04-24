import { db } from '../../../shared/infrastructure/db/client.js'
import { AccountConfig, AccountConfigInput, AccountMode, AuthType, PollingMethod } from '../domain/AccountConfig.js'
import { IAccountConfigRepository } from '../domain/IAccountConfigRepository.js'

function reconstitute(row: any): AccountConfig {
  return {
    id: row.id,
    accountId: row.account_id,
    mode: row.mode as AccountMode,
    pendingOrdersEndpoint: row.pending_orders_endpoint,
    webhookUrl: row.webhook_url,
    retryLimit: row.retry_limit,
    pollingMethod: row.polling_method as PollingMethod,
    pollingBody: row.polling_body,
    authType: row.auth_type as AuthType,
    authToken: row.auth_token,
    webhookAuthType: row.webhook_auth_type as AuthType | null,
    webhookAuthToken: row.webhook_auth_token,
    notifyOnExpired: row.notify_on_expired,
    webhookExtraFields: row.webhook_extra_fields,
  }
}

export class AccountConfigRepository implements IAccountConfigRepository {
  async findByAccountId(accountId: string): Promise<AccountConfig | null> {
    const { rows } = await db.query(
      `SELECT * FROM account_config WHERE account_id = $1`,
      [accountId]
    )
    return rows[0] ? reconstitute(rows[0]) : null
  }

  async upsert(input: AccountConfigInput): Promise<AccountConfig> {
    const { rows } = await db.query(
      `INSERT INTO account_config
         (id, account_id, pending_orders_endpoint, webhook_url,
          retry_limit, polling_method, polling_body, auth_type, auth_token,
          webhook_auth_type, webhook_auth_token, notify_on_expired, webhook_extra_fields, mode)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (account_id) DO UPDATE SET
         pending_orders_endpoint = $2,
         webhook_url             = $3,
         retry_limit             = $4,
         polling_method          = $5,
         polling_body            = $6,
         auth_type               = $7,
         auth_token              = $8,
         webhook_auth_type       = $9,
         webhook_auth_token      = $10,
         notify_on_expired       = $11,
         webhook_extra_fields    = $12,
         mode                    = $13,
         updated_at              = now()
       RETURNING *`,
      [
        input.accountId,
        input.pendingOrdersEndpoint,
        input.webhookUrl,
        input.retryLimit,
        input.pollingMethod,
        input.pollingBody,
        input.authType,
        input.authToken,
        input.webhookAuthType,
        input.webhookAuthToken,
        input.notifyOnExpired,
        input.webhookExtraFields,
        input.mode,
      ]
    )
    return reconstitute(rows[0])
  }
}
