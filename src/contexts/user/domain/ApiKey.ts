// Scopes gate what an API key may do so keep them narrow and additive
export type ApiScope = 'otp:write' | 'status:read'

export const ALL_API_SCOPES: ApiScope[] = ['otp:write', 'status:read']

export interface ApiKey {
  id: string
  userId: string
  name: string
  prefix: string
  scopes: ApiScope[]
  // null means every account owned by the user otherwise restricted to these account ids
  accountIds: string[] | null
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

// The authenticated principal attached to a request by the API key middleware
export interface ApiKeyPrincipal {
  keyId: string
  userId: string
  scopes: ApiScope[]
  accountIds: string[] | null
}

export function hasScope(principal: ApiKeyPrincipal, scope: ApiScope): boolean {
  return principal.scopes.includes(scope)
}

export function allowsAccount(principal: ApiKeyPrincipal, accountId: string): boolean {
  return principal.accountIds === null || principal.accountIds.includes(accountId)
}
