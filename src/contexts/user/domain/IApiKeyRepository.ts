import { ApiKey, ApiScope } from './ApiKey.js'

export interface CreateApiKeyInput {
  userId: string
  name: string
  prefix: string
  hash: string
  scopes: ApiScope[]
  accountIds: string[] | null
}

// A stored key plus its hash returned only to the auth path for verification
export interface ApiKeyWithHash extends ApiKey {
  hash: string
}

export interface IApiKeyRepository {
  create(input: CreateApiKeyInput): Promise<ApiKey>
  listByUser(userId: string): Promise<ApiKey[]>
  findActiveByPrefix(prefix: string): Promise<ApiKeyWithHash | null>
  revoke(id: string, userId: string): Promise<boolean>
  touchLastUsed(id: string): Promise<void>
}
