import { describe, it, expect, vi } from 'vitest'
import {
  ListApiKeysUseCase,
  RevokeApiKeyUseCase,
  AuthenticateApiKeyUseCase,
} from './ManageApiKeysUseCase.js'
import type { IApiKeyRepository } from '../domain/IApiKeyRepository.js'
import type { IUserRepository } from '../domain/IUserRepository.js'
import type { ITotpProvider } from '../domain/ports/ITotpProvider.js'
import type { User } from '../domain/User.js'
import { NotFoundError, UnauthorizedError } from '../../../shared/errors/index.js'
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

function makeUser(opts: { totpEnabled: boolean; totpLastStep?: number | null }) {
  return {
    isTotpEnabled: () => opts.totpEnabled,
    totpSecret: opts.totpEnabled ? 'SECRET32' : null,
    totpLastStep: opts.totpLastStep ?? null,
    recordTotpStep: vi.fn(),
  }
}

function makeUserRepo(user: ReturnType<typeof makeUser> | null) {
  return {
    findById: vi.fn().mockResolvedValue(user),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

function makeTotp() {
  return { generateSecret: vi.fn(), keyUri: vi.fn(), verify: vi.fn() }
}

// The repo/userRepo/totp partials carry only the methods the use case touches.
function newRevoke(
  repo: ReturnType<typeof makeRepo>,
  userRepo: ReturnType<typeof makeUserRepo>,
  totp: ReturnType<typeof makeTotp>,
) {
  return new RevokeApiKeyUseCase(
    repo,
    userRepo as unknown as IUserRepository,
    totp as unknown as ITotpProvider,
  )
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
  it('revokes without a code when 2FA is disabled', async () => {
    const repo = makeRepo()
    repo.revoke.mockResolvedValue(true)
    const user = makeUser({ totpEnabled: false })
    const userRepo = makeUserRepo(user)
    const totp = makeTotp()

    const result = await newRevoke(repo, userRepo, totp).execute('key-1', 'user-1')

    expect(result).toBe(true)
    expect(repo.revoke).toHaveBeenCalledWith('key-1', 'user-1')
    expect(totp.verify).not.toHaveBeenCalled()
    expect(userRepo.save).not.toHaveBeenCalled()
  })

  it('throws when the user no longer exists', async () => {
    const repo = makeRepo()
    const userRepo = makeUserRepo(null)

    await expect(
      newRevoke(repo, userRepo, makeTotp()).execute('key-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.revoke).not.toHaveBeenCalled()
  })

  it('rejects with no revoke when 2FA is on and no code is provided', async () => {
    const repo = makeRepo()
    const userRepo = makeUserRepo(makeUser({ totpEnabled: true }))
    const totp = makeTotp()

    await expect(
      newRevoke(repo, userRepo, totp).execute('key-1', 'user-1'),
    ).rejects.toBeInstanceOf(UnauthorizedError)
    expect(totp.verify).not.toHaveBeenCalled()
    expect(repo.revoke).not.toHaveBeenCalled()
  })

  it('rejects with no revoke when the TOTP code is invalid', async () => {
    const repo = makeRepo()
    const userRepo = makeUserRepo(makeUser({ totpEnabled: true, totpLastStep: 10 }))
    const totp = makeTotp()
    totp.verify.mockResolvedValue({ valid: false })

    await expect(
      newRevoke(repo, userRepo, totp).execute('key-1', 'user-1', '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedError)
    expect(totp.verify).toHaveBeenCalledWith('SECRET32', '000000', { afterTimeStep: 10 })
    expect(repo.revoke).not.toHaveBeenCalled()
  })

  it('revokes and records the consumed step on a valid code', async () => {
    const repo = makeRepo()
    repo.revoke.mockResolvedValue(true)
    const user = makeUser({ totpEnabled: true, totpLastStep: 10 })
    const userRepo = makeUserRepo(user)
    const totp = makeTotp()
    totp.verify.mockResolvedValue({ valid: true, timeStep: 42 })

    const result = await newRevoke(repo, userRepo, totp).execute('key-1', 'user-1', '123456')

    expect(result).toBe(true)
    expect(repo.revoke).toHaveBeenCalledWith('key-1', 'user-1')
    expect(user.recordTotpStep).toHaveBeenCalledWith(42)
    expect(userRepo.save).toHaveBeenCalledWith(user)
  })

  it('does not record the step when the key was not found', async () => {
    const repo = makeRepo()
    repo.revoke.mockResolvedValue(false)
    const user = makeUser({ totpEnabled: true })
    const userRepo = makeUserRepo(user)
    const totp = makeTotp()
    totp.verify.mockResolvedValue({ valid: true, timeStep: 42 })

    const result = await newRevoke(repo, userRepo, totp).execute('key-1', 'user-1', '123456')

    expect(result).toBe(false)
    expect(user.recordTotpStep).not.toHaveBeenCalled()
    expect(userRepo.save).not.toHaveBeenCalled()
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
