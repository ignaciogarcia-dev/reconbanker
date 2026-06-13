import { describe, it, expect, vi } from 'vitest'
import { CreateApiKeyUseCase } from './CreateApiKeyUseCase.js'
import type { IApiKeyRepository } from '../domain/IApiKeyRepository.js'
import type { ApiKey } from '../domain/ApiKey.js'
import { ValidationError } from '../../../shared/errors/index.js'

function makeRepo() {
  return {
    create: vi.fn<IApiKeyRepository['create']>(),
    listByUser: vi.fn<IApiKeyRepository['listByUser']>(),
    findActiveByPrefix: vi.fn<IApiKeyRepository['findActiveByPrefix']>(),
    revoke: vi.fn<IApiKeyRepository['revoke']>(),
    touchLastUsed: vi.fn<IApiKeyRepository['touchLastUsed']>(),
  }
}

function storedKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key-1',
    userId: 'user-1',
    name: 'CI key',
    prefix: 'abcd1234',
    scopes: ['otp:write'],
    accountIds: null,
    createdAt: new Date(),
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  }
}

const baseCmd = {
  userId: 'user-1',
  name: 'CI key',
  scopes: ['otp:write'],
  accountIds: null,
}

describe('CreateApiKeyUseCase', () => {
  it('creates a key and returns the stored key plus the plaintext', async () => {
    const repo = makeRepo()
    repo.create.mockResolvedValue(storedKey())
    const useCase = new CreateApiKeyUseCase(repo)

    const result = await useCase.execute(baseCmd)

    expect(result.apiKey).toEqual(storedKey({ createdAt: result.apiKey.createdAt }))
    expect(result.plaintext).toMatch(/^rbk_[0-9a-f]{8}_[0-9a-f]{64}$/)
    const input = repo.create.mock.calls[0][0]
    expect(input.userId).toBe('user-1')
    expect(input.name).toBe('CI key')
    expect(input.scopes).toEqual(['otp:write'])
    expect(input.accountIds).toBeNull()
    expect(result.plaintext).toContain(input.prefix)
  })

  it('trims the name before storing', async () => {
    const repo = makeRepo()
    repo.create.mockResolvedValue(storedKey())
    const useCase = new CreateApiKeyUseCase(repo)

    await useCase.execute({ ...baseCmd, name: '  padded  ' })

    expect(repo.create.mock.calls[0][0].name).toBe('padded')
  })

  it('normalizes an empty accountIds array to null', async () => {
    const repo = makeRepo()
    repo.create.mockResolvedValue(storedKey())
    const useCase = new CreateApiKeyUseCase(repo)

    await useCase.execute({ ...baseCmd, accountIds: [] })

    expect(repo.create.mock.calls[0][0].accountIds).toBeNull()
  })

  it('passes accountIds through when provided', async () => {
    const repo = makeRepo()
    repo.create.mockResolvedValue(storedKey())
    const useCase = new CreateApiKeyUseCase(repo)

    await useCase.execute({ ...baseCmd, accountIds: ['acc-1'] })

    expect(repo.create.mock.calls[0][0].accountIds).toEqual(['acc-1'])
  })

  it('rejects a blank name', async () => {
    const useCase = new CreateApiKeyUseCase(makeRepo())
    await expect(useCase.execute({ ...baseCmd, name: '   ' }))
      .rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects unknown scopes', async () => {
    const useCase = new CreateApiKeyUseCase(makeRepo())
    await expect(useCase.execute({ ...baseCmd, scopes: ['otp:write', 'admin:all'] }))
      .rejects.toThrow(/Unknown scopes: admin:all/)
  })

  it('rejects an empty scope list', async () => {
    const useCase = new CreateApiKeyUseCase(makeRepo())
    await expect(useCase.execute({ ...baseCmd, scopes: [] }))
      .rejects.toThrow(/At least one scope/)
  })

  it('retries with a fresh key when the insert fails (prefix collision)', async () => {
    const repo = makeRepo()
    repo.create
      .mockRejectedValueOnce(new Error('duplicate key'))
      .mockRejectedValueOnce(new Error('duplicate key'))
      .mockResolvedValueOnce(storedKey())
    const useCase = new CreateApiKeyUseCase(repo)

    const result = await useCase.execute(baseCmd)

    expect(repo.create).toHaveBeenCalledTimes(3)
    expect(result.apiKey.id).toBe('key-1')
    // Each attempt generates a fresh prefix
    const prefixes = repo.create.mock.calls.map((c) => c[0].prefix)
    expect(new Set(prefixes).size).toBe(3)
  })

  it('throws the last error after three failed attempts', async () => {
    const repo = makeRepo()
    repo.create.mockRejectedValue(new Error('still colliding'))
    const useCase = new CreateApiKeyUseCase(repo)

    await expect(useCase.execute(baseCmd)).rejects.toThrow('still colliding')
    expect(repo.create).toHaveBeenCalledTimes(3)
  })
})
