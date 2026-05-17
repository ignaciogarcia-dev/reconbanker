import { AccountConfig, AccountConfigInput } from '../domain/AccountConfig.js'
import { IAccountConfigRepository } from '../domain/IAccountConfigRepository.js'
import { Executor } from './Executor.js'
import { AccountConfigRowMapper, AccountConfigRow } from './mappers/AccountConfigRowMapper.js'

export class AccountConfigRepository implements IAccountConfigRepository {
  constructor(private readonly executor: Executor) {}

  withTx(tx: Executor): AccountConfigRepository {
    return new AccountConfigRepository(tx)
  }

  async findByAccountId(accountId: string): Promise<AccountConfig | null> {
    const { rows } = await this.executor.query<AccountConfigRow>(
      `SELECT * FROM account_config WHERE account_id = $1`,
      [accountId]
    )
    return rows[0] ? AccountConfigRowMapper.toDto(rows[0]) : null
  }

  async upsert(input: AccountConfigInput): Promise<AccountConfig> {
    const { rows } = await this.executor.query<AccountConfigRow>(
      `INSERT INTO account_config
         (id, account_id, pending_orders_endpoint, webhook_url,
          retry_limit, polling_method, polling_body, auth_type, auth_token,
          webhook_auth_type, webhook_auth_token, notify_on_expired, webhook_extra_fields, silent_ingestion)
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
         silent_ingestion        = $13,
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
        input.silentIngestion,
      ]
    )
    return AccountConfigRowMapper.toDto(rows[0])
  }
}
