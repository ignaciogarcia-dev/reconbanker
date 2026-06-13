import { ApiKey, ApiScope } from '../domain/ApiKey.js'
import { IApiKeyRepository, CreateApiKeyInput, ApiKeyWithHash } from '../domain/IApiKeyRepository.js'
import { Executor } from './Executor.js'

interface ApiKeyRow {
  id: string
  user_id: string
  name: string
  prefix: string
  hash: string
  scopes: ApiScope[]
  account_ids: string[] | null
  created_at: Date
  last_used_at: Date | null
  revoked_at: Date | null
}

function toDto(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes ?? [],
    accountIds: row.account_ids,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }
}

export class ApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly executor: Executor) {}

  async create(input: CreateApiKeyInput): Promise<ApiKey> {
    const { rows } = await this.executor.query<ApiKeyRow>(
      `INSERT INTO api_keys (user_id, name, prefix, hash, scopes, account_ids)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
       RETURNING *`,
      [
        input.userId, input.name, input.prefix, input.hash,
        JSON.stringify(input.scopes),
        input.accountIds ? JSON.stringify(input.accountIds) : null,
      ]
    )
    return toDto(rows[0])
  }

  async listByUser(userId: string): Promise<ApiKey[]> {
    const { rows } = await this.executor.query<ApiKeyRow>(
      `SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    )
    return rows.map(toDto)
  }

  async findActiveByPrefix(prefix: string): Promise<ApiKeyWithHash | null> {
    const { rows } = await this.executor.query<ApiKeyRow>(
      `SELECT * FROM api_keys WHERE prefix = $1 AND revoked_at IS NULL LIMIT 1`,
      [prefix]
    )
    return rows[0] ? { ...toDto(rows[0]), hash: rows[0].hash } : null
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.executor.query(
      `UPDATE api_keys SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [id, userId]
    )
    return (rowCount ?? 0) > 0
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.executor.query(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [id])
  }
}
