import { ApiKey, ApiKeyPrincipal } from '../domain/ApiKey.js'
import { IApiKeyRepository } from '../domain/IApiKeyRepository.js'
import { parseApiKey, secretMatches } from '../infrastructure/apiKeyCrypto.js'

export class ListApiKeysUseCase {
  constructor(private readonly repo: IApiKeyRepository) {}
  execute(userId: string): Promise<ApiKey[]> {
    return this.repo.listByUser(userId)
  }
}

export class RevokeApiKeyUseCase {
  constructor(private readonly repo: IApiKeyRepository) {}
  execute(id: string, userId: string): Promise<boolean> {
    return this.repo.revoke(id, userId)
  }
}

// Returns the principal or null on any failure and touches last_used_at fire-and-forget so it never blocks the request
export class AuthenticateApiKeyUseCase {
  constructor(private readonly repo: IApiKeyRepository) {}

  async execute(raw: string): Promise<ApiKeyPrincipal | null> {
    const parsed = parseApiKey(raw)
    if (!parsed) return null
    const row = await this.repo.findActiveByPrefix(parsed.prefix)
    if (!row) return null
    if (!secretMatches(parsed.secret, row.hash)) return null
    void this.repo.touchLastUsed(row.id).catch(() => {})
    return { keyId: row.id, userId: row.userId, scopes: row.scopes, accountIds: row.accountIds }
  }
}
