import type pg from 'pg'
import {
  IAccountConfigReader,
  PollingConfig,
  WebhookConfig,
} from '../../domain/ports/IAccountConfigReader.js'

export class AccountConfigReaderAdapter implements IAccountConfigReader {
  constructor(private readonly pool: pg.Pool) {}

  async findPollingConfig(accountId: string): Promise<PollingConfig | null> {
    const { rows } = await this.pool.query(
      `SELECT account_id, pending_orders_endpoint, polling_method, polling_body, auth_type, auth_token
         FROM account_config WHERE account_id = $1`,
      [accountId]
    )
    const r = rows[0]
    if (!r) return null
    return {
      accountId: r.account_id,
      pendingOrdersEndpoint: r.pending_orders_endpoint,
      pollingMethod: r.polling_method,
      pollingBody: r.polling_body,
      authType: r.auth_type,
      authToken: r.auth_token,
    }
  }

  async findWebhookConfigForRequest(requestId: string): Promise<WebhookConfig | null> {
    const { rows } = await this.pool.query(
      `SELECT ac.account_id, ac.webhook_url, ac.webhook_auth_type, ac.webhook_auth_token,
              ac.auth_type, ac.auth_token, ac.webhook_extra_fields, ac.notify_on_expired
         FROM conciliation_requests cr
         JOIN account_config ac ON ac.account_id = cr.account_id
        WHERE cr.id = $1`,
      [requestId]
    )
    const r = rows[0]
    if (!r) return null
    return {
      accountId: r.account_id,
      webhookUrl: r.webhook_url,
      webhookAuthType: r.webhook_auth_type,
      webhookAuthToken: r.webhook_auth_token,
      authType: r.auth_type,
      authToken: r.auth_token,
      webhookExtraFields: r.webhook_extra_fields,
      notifyOnExpired: !!r.notify_on_expired,
    }
  }

  async shouldNotifyOnExpired(accountId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT notify_on_expired FROM account_config WHERE account_id = $1`,
      [accountId]
    )
    return !!rows[0]?.notify_on_expired
  }
}
