import { ApiKey, ApiScope, ALL_API_SCOPES } from '../domain/ApiKey.js'
import { IApiKeyRepository } from '../domain/IApiKeyRepository.js'
import { generateApiKey } from '../infrastructure/apiKeyCrypto.js'
import { ValidationError } from '../../../shared/errors/index.js'

export interface CreateApiKeyCommand {
  userId: string
  name: string
  scopes: string[]
  accountIds: string[] | null
}

export interface CreateApiKeyResult {
  apiKey: ApiKey
  // The full secret returned exactly once and never retrievable again
  plaintext: string
}

export class CreateApiKeyUseCase {
  constructor(private readonly repo: IApiKeyRepository) {}

  async execute(cmd: CreateApiKeyCommand): Promise<CreateApiKeyResult> {
    if (!cmd.name.trim()) throw new ValidationError('name is required')
    const scopes = cmd.scopes as ApiScope[]
    const invalid = scopes.filter((s) => !ALL_API_SCOPES.includes(s))
    if (invalid.length) throw new ValidationError(`Unknown scopes: ${invalid.join(', ')}`)
    if (scopes.length === 0) throw new ValidationError('At least one scope is required')

    const accountIds = cmd.accountIds && cmd.accountIds.length ? cmd.accountIds : null

    // Retry because a unique-indexed prefix collision would otherwise surface as a raw DB error
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      const generated = generateApiKey()
      try {
        const apiKey = await this.repo.create({
          userId: cmd.userId,
          name: cmd.name.trim(),
          prefix: generated.prefix,
          hash: generated.hash,
          scopes,
          accountIds,
        })
        return { apiKey, plaintext: generated.plaintext }
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr
  }
}
