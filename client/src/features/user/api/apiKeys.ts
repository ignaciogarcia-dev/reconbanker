import { httpClient } from '@/shared/http/client'

export type ApiScope = 'otp:write' | 'status:read'

export interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: ApiScope[]
  account_ids: string[] | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface ApiKeysResponse {
  keys: ApiKey[]
  available_scopes: ApiScope[]
}

export interface CreatedApiKey extends ApiKey {
  // Full secret shown exactly once
  key: string
}

export async function listApiKeys(): Promise<ApiKeysResponse> {
  const { data } = await httpClient.get<ApiKeysResponse>('/me/api-keys')
  return data
}

export async function createApiKey(input: {
  name: string
  scopes: ApiScope[]
  account_ids: string[] | null
}): Promise<CreatedApiKey> {
  const { data } = await httpClient.post<CreatedApiKey>('/me/api-keys', input)
  return data
}

export async function revokeApiKey(id: string): Promise<void> {
  await httpClient.delete(`/me/api-keys/${id}`)
}
