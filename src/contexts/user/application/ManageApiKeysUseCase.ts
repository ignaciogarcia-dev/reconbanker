import { ApiKey, ApiKeyPrincipal } from '../domain/ApiKey.js'
import { IApiKeyRepository } from '../domain/IApiKeyRepository.js'
import { IUserRepository } from '../domain/IUserRepository.js'
import { ITotpProvider } from '../domain/ports/ITotpProvider.js'
import { NotFoundError, UnauthorizedError } from '../../../shared/errors/index.js'
import { parseApiKey, secretMatches } from '../infrastructure/apiKeyCrypto.js'

export class ListApiKeysUseCase {
  constructor(private readonly repo: IApiKeyRepository) {}
  execute(userId: string): Promise<ApiKey[]> {
    return this.repo.listByUser(userId)
  }
}

/**
 * Revokes a key. When the owner has 2FA enabled, a valid current TOTP code is
 * required (backup codes are intentionally NOT accepted for this action, so we
 * verify against the TOTP provider directly rather than via verifyTwoFactorCode).
 */
export class RevokeApiKeyUseCase {
  constructor(
    private readonly repo: IApiKeyRepository,
    private readonly userRepo: IUserRepository,
    private readonly totp: ITotpProvider,
  ) {}

  async execute(id: string, userId: string, code?: string): Promise<boolean> {
    const user = await this.userRepo.findById(userId)
    if (!user) throw new NotFoundError('User not found')

    let stepToRecord: number | undefined
    if (user.isTotpEnabled()) {
      const trimmed = (code ?? '').trim()
      if (!trimmed) throw new UnauthorizedError('Invalid code')
      // afterTimeStep rejects an already-consumed step, mirroring the replay
      // guard in verifyTwoFactorCode's TOTP path.
      const res = await this.totp.verify(user.totpSecret!, trimmed, { afterTimeStep: user.totpLastStep })
      if (!res.valid) throw new UnauthorizedError('Invalid code')
      stepToRecord = res.timeStep
    }

    const revoked = await this.repo.revoke(id, userId)
    // Persist the consumed step only after a successful revoke, so revoking a
    // non-existent key (404) doesn't burn the user's current code.
    if (revoked && stepToRecord !== undefined) {
      user.recordTotpStep(stepToRecord)
      await this.userRepo.save(user)
    }
    return revoked
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
