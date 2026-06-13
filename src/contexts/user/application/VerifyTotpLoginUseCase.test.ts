import { describe, it, expect, vi } from 'vitest'
import { VerifyTotpLoginUseCase } from './VerifyTotpLoginUseCase.js'
import { User } from '../domain/User.js'
import { InMemoryUserRepository } from '../../../../tests/helpers/inMemoryUserRepo.js'
import { InMemoryBackupCodeRepository } from '../../../../tests/helpers/inMemoryBackupCodeRepo.js'
import { UnauthorizedError } from '../../../shared/errors/index.js'
import type { TwoFactorDeps } from './verifyTwoFactorCode.js'

const hasher = {
  hash: async (plain: string) => `hashed:${plain}`,
  verify: async (plain: string, hash: string) => hash === `hashed:${plain}`,
}

const totp = {
  generateSecret: () => 'SECRET',
  keyUri: () => 'otpauth://totp/x',
  verify: async (secret: string, token: string) => ({
    valid: secret === 'SECRET' && token === '123456',
    timeStep: 100,
  }),
}

const issuer = {
  issue: (p: { sub: string; scope?: string }) => `token:${p.scope ?? 'access'}:${p.sub}`,
  verify: (t: string) => {
    const [, scope, sub] = t.split(':')
    return sub ? { sub, email: 'a@b.com', scope: scope as 'access' | '2fa_pending' } : null
  },
}

function setup() {
  const repo = new InMemoryUserRepository()
  const backupCodes = new InMemoryBackupCodeRepository()
  const user = User.create('id-1', 'alice@example.com', 'hashed:secret', 'Alice')
  user.beginTotpEnrollment('SECRET')
  user.confirmTotp()
  repo.store.set(user.id, user)
  const deps: TwoFactorDeps = { totp, backupCodes, hasher }
  return { repo, backupCodes, user, useCase: new VerifyTotpLoginUseCase(repo, issuer, deps) }
}

describe('VerifyTotpLoginUseCase', () => {
  it('issues a session token for a valid TOTP code', async () => {
    const { useCase } = setup()
    const result = await useCase.execute({ challengeToken: 'token:2fa_pending:id-1', code: '123456' })
    expect(result.token).toBe('token:access:id-1')
    expect(result.user.email).toBe('alice@example.com')
  })

  it('persists the verified TOTP time step so the code cannot be replayed', async () => {
    const { useCase, repo, user } = setup()
    const saveSpy = vi.spyOn(repo, 'save')
    await useCase.execute({ challengeToken: 'token:2fa_pending:id-1', code: '123456' })
    expect(saveSpy).toHaveBeenCalledWith(user)
    expect(user.totpLastStep).toBe(100)
  })

  it('accepts a valid backup code and consumes it', async () => {
    const { useCase, backupCodes } = setup()
    await backupCodes.replaceForUser('id-1', ['hashed:ABCDEFGHJK'])
    const result = await useCase.execute({ challengeToken: 'token:2fa_pending:id-1', code: 'ABCDE-FGHJK' })
    expect(result.token).toBe('token:access:id-1')
    expect(await backupCodes.listActive('id-1')).toHaveLength(0)
  })

  it('rejects an access-scoped token (must be a 2fa challenge)', async () => {
    const { useCase } = setup()
    await expect(
      useCase.execute({ challengeToken: 'token:access:id-1', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('rejects an invalid code', async () => {
    const { useCase } = setup()
    await expect(
      useCase.execute({ challengeToken: 'token:2fa_pending:id-1', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('rejects when the challenge token is unverifiable', async () => {
    const { useCase } = setup()
    await expect(
      useCase.execute({ challengeToken: 'garbage', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('rejects a challenge whose user no longer exists', async () => {
    const { useCase } = setup()
    await expect(
      useCase.execute({ challengeToken: 'token:2fa_pending:ghost', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('rejects a backup code that was already consumed', async () => {
    const { useCase, backupCodes } = setup()
    await backupCodes.replaceForUser('id-1', ['hashed:ABCDEFGHJK'])
    await useCase.execute({ challengeToken: 'token:2fa_pending:id-1', code: 'ABCDE-FGHJK' })
    await expect(
      useCase.execute({ challengeToken: 'token:2fa_pending:id-1', code: 'ABCDE-FGHJK' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
