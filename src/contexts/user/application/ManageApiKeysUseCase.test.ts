import { describe, it, expect, vi } from 'vitest'
import {
  ListApiKeysUseCase,
  RevokeApiKeyUseCase,
  AuthenticateApiKeyUseCase,
} from './ManageApiKeysUseCase.js'
import type { IApiKeyRepository } from '../domain/IApiKeyRepository.js'
import { generateApiKey } from '../infrastructure/apiKeyCrypto.js'

function makeRepo() {
  return {
    create: vi.fn(),
    listByUser: vi.fn(),
    findActiveByPrefix: vi.fn(),
    revoke: vi.fn(),
    touchLastUsed: vi.fn(),
  } satisfies IApiKeyRepository
}

describe('ListApiKeysUseCase', () => {
  it('delegates to the repository', async () => {
    const repo = makeRepo()
    repo.listByUser.mockResolvedValue([{ id: 'k1' }])

    const result = await new ListApiKeysUseCase(repo).execute('user-1')

    expect(repo.listByUser).toHaveBeenCalledWith('user-1')
    expect(result).toEqual([{ id: 'k1' }])
  })
})

describe('RevokeApiKeyUseCase', () => {
  it('delegates to the repository scoped by user', async () => {
    const repo = makeRepo()
    repo.revoke.mockResolvedValue(true)

    const result = await new RevokeApiKeyUseCase(repo).execute('key-1', 'user-1')

    expect(repo.revoke).toHaveBeenCalledWith('key-1', 'user-1')
    expect(result).toBe(true)
  })
})

describe('AuthenticateApiKeyUseCase', () => {
  function makeStoredKey() {
    const generated = generateApiKey()
    return {
      generated,
      row: {
        id: 'key-1',
        userId: 'user-1',
        name: 'CI key',
        prefix: generated.prefix,
        hash: generated.hash,
        scopes: ['otp:write' as const],
        accountIds: ['acc-1'],
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      },
    }
  }

  it('returns the principal and touches last_used_at on a valid key', async () => {
    const repo = makeRepo()
    const { generated, row } = makeStoredKey()
    repo.findActiveByPrefix.mockResolvedValue(row)
    repo.touchLastUsed.mockResolvedValue(undefined)

    const principal = await new AuthenticateApiKeyUseCase(repo).execute(generated.plaintext)

    expect(principal).toEqual({
      keyId: 'key-1',
      userId: 'user-1',
      scopes: ['otp:write'],
      accountIds: ['acc-1'],
    })
    expect(repo.findActiveByPrefix).toHaveBeenCalledWith(generated.prefix)
    expect(repo.touchLastUsed).toHaveBeenCalledWith('key-1')
  })

  it('returns null for a malformed key without hitting the repository', async () => {
    const repo = makeRepo()

    const principal = await new AuthenticateApiKeyUseCase(repo).execute('not-an-api-key')

    expect(principal).toBeNull()
    expect(repo.findActiveByPrefix).not.toHaveBeenCalled()
  })

  it('returns null when no active key matches the prefix', async () => {
    const repo = makeRepo()
    repo.findActiveByPrefix.mockResolvedValue(null)
    const { generated } = makeStoredKey()

    const principal = await new AuthenticateApiKeyUseCase(repo).execute(generated.plaintext)

    expect(principal).toBeNull()
    expect(repo.touchLastUsed).not.toHaveBeenCalled()
  })

  it('returns null when the secret does not match the stored hash', async () => {
    const repo = makeRepo()
    const { row } = makeStoredKey()
    const other = generateApiKey()
    repo.findActiveByPrefix.mockResolvedValue({ ...row, prefix: other.prefix })

    const principal = await new AuthenticateApiKeyUseCase(repo).execute(other.plaintext)

    expect(principal).toBeNull()
    expect(repo.touchLastUsed).not.toHaveBeenCalled()
  })

  it('still authenticates when touching last_used_at fails', async () => {
    const repo = makeRepo()
    const { generated, row } = makeStoredKey()
    repo.findActiveByPrefix.mockResolvedValue(row)
    repo.touchLastUsed.mockRejectedValue(new Error('db down'))

    const principal = await new AuthenticateApiKeyUseCase(repo).execute(generated.plaintext)

    expect(principal?.keyId).toBe('key-1')
    // Let the fire-and-forget rejection settle so it cannot fail the test run.
    await new Promise((r) => setImmediate(r))
  })
})
