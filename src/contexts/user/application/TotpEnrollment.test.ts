import { describe, it, expect } from 'vitest'
import { StartTotpEnrollmentUseCase } from './StartTotpEnrollmentUseCase.js'
import { ConfirmTotpEnrollmentUseCase } from './ConfirmTotpEnrollmentUseCase.js'
import { DisableTotpUseCase } from './DisableTotpUseCase.js'
import { User } from '../domain/User.js'
import { InMemoryUserRepository } from '../../../../tests/helpers/inMemoryUserRepo.js'
import { InMemoryBackupCodeRepository } from '../../../../tests/helpers/inMemoryBackupCodeRepo.js'
import { InMemoryUnitOfWork } from '../../../../tests/helpers/inMemoryUnitOfWork.js'
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../../shared/errors/index.js'
import type { TwoFactorDeps } from './verifyTwoFactorCode.js'

const hasher = {
  hash: async (plain: string) => `hashed:${plain}`,
  verify: async (plain: string, hash: string) => hash === `hashed:${plain}`,
}

const totp = {
  generateSecret: () => 'SECRET',
  keyUri: (secret: string, label: string) => `otpauth://totp/ReconBanker:${label}?secret=${secret}`,
  verify: async (secret: string, token: string) => ({
    valid: secret === 'SECRET' && token === '123456',
    timeStep: 100,
  }),
}

function makeRepos() {
  const repo = new InMemoryUserRepository()
  const backupCodes = new InMemoryBackupCodeRepository()
  const deps: TwoFactorDeps = { totp, backupCodes, hasher }
  return { repo, backupCodes, deps }
}

describe('StartTotpEnrollmentUseCase', () => {
  it('stores a pending secret and returns an otpauth URI without enabling 2FA', async () => {
    const { repo } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    repo.store.set(user.id, user)
    const result = await new StartTotpEnrollmentUseCase(repo, totp).execute('id-1')

    expect(result.otpauthUri).toContain('otpauth://totp/')
    const stored = await repo.findById('id-1')
    expect(stored?.totpSecret).toBe('SECRET')
    expect(stored?.isTotpEnabled()).toBe(false)
  })

  it('refuses to re-enroll when 2FA is already enabled', async () => {
    const { repo } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    user.beginTotpEnrollment('SECRET')
    user.confirmTotp()
    repo.store.set(user.id, user)
    await expect(new StartTotpEnrollmentUseCase(repo, totp).execute('id-1')).rejects.toBeInstanceOf(ConflictError)
  })

  it('throws NotFoundError for an unknown user', async () => {
    const { repo } = makeRepos()
    await expect(new StartTotpEnrollmentUseCase(repo, totp).execute('ghost')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('allows enrolling again after 2FA was disabled', async () => {
    const { repo } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    user.beginTotpEnrollment('SECRET')
    user.confirmTotp()
    user.disableTotp()
    repo.store.set(user.id, user)
    const result = await new StartTotpEnrollmentUseCase(repo, totp).execute('id-1')
    expect(result.otpauthUri).toContain('otpauth://totp/')
    expect((await repo.findById('id-1'))?.totpSecret).toBe('SECRET')
  })
})

describe('ConfirmTotpEnrollmentUseCase', () => {
  it('enables 2FA on a valid code and returns backup codes', async () => {
    const { repo, backupCodes } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    user.beginTotpEnrollment('SECRET')
    repo.store.set(user.id, user)

    const result = await new ConfirmTotpEnrollmentUseCase(repo, totp, backupCodes, hasher, new InMemoryUnitOfWork())
      .execute({ userId: 'id-1', code: '123456' })

    expect(result.backupCodes).toHaveLength(10)
    expect((await repo.findById('id-1'))?.isTotpEnabled()).toBe(true)
    expect(await backupCodes.listActive('id-1')).toHaveLength(10)
  })

  it('records the consumed time step so the enrollment code cannot be replayed at login', async () => {
    const { repo, backupCodes } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    user.beginTotpEnrollment('SECRET')
    repo.store.set(user.id, user)

    await new ConfirmTotpEnrollmentUseCase(repo, totp, backupCodes, hasher, new InMemoryUnitOfWork())
      .execute({ userId: 'id-1', code: '123456' })

    // The provider matched time step 100; persisting it lets verifyTwoFactorCode
    // reject a replay of the same code at the user's first login.
    expect((await repo.findById('id-1'))?.totpLastStep).toBe(100)
  })

  it('still enables 2FA when the provider reports no time step', async () => {
    const { repo, backupCodes } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    user.beginTotpEnrollment('SECRET')
    repo.store.set(user.id, user)
    // A provider variant that validates but does not return a time step.
    const totpNoStep = { ...totp, verify: async () => ({ valid: true }) }

    await new ConfirmTotpEnrollmentUseCase(repo, totpNoStep, backupCodes, hasher, new InMemoryUnitOfWork())
      .execute({ userId: 'id-1', code: '123456' })

    const stored = await repo.findById('id-1')
    expect(stored?.isTotpEnabled()).toBe(true)
    expect(stored?.totpLastStep).toBeNull()
  })

  it('rejects an invalid code and keeps 2FA disabled', async () => {
    const { repo, backupCodes } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    user.beginTotpEnrollment('SECRET')
    repo.store.set(user.id, user)

    await expect(
      new ConfirmTotpEnrollmentUseCase(repo, totp, backupCodes, hasher, new InMemoryUnitOfWork()).execute({ userId: 'id-1', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
    expect((await repo.findById('id-1'))?.isTotpEnabled()).toBe(false)
  })

  it('fails when there is no enrollment in progress', async () => {
    const { repo, backupCodes } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    repo.store.set(user.id, user)
    await expect(
      new ConfirmTotpEnrollmentUseCase(repo, totp, backupCodes, hasher, new InMemoryUnitOfWork()).execute({ userId: 'id-1', code: '123456' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('DisableTotpUseCase', () => {
  function enabledUser(repo: InMemoryUserRepository) {
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    user.beginTotpEnrollment('SECRET')
    user.confirmTotp()
    repo.store.set(user.id, user)
    return user
  }

  it('disables 2FA with correct password and code, clearing backup codes', async () => {
    const { repo, backupCodes, deps } = makeRepos()
    enabledUser(repo)
    await backupCodes.replaceForUser('id-1', ['hashed:ABCDEFGHJK'])

    await new DisableTotpUseCase(repo, hasher, backupCodes, deps, new InMemoryUnitOfWork())
      .execute({ userId: 'id-1', password: 'pw', code: '123456' })

    expect((await repo.findById('id-1'))?.isTotpEnabled()).toBe(false)
    expect(await backupCodes.listActive('id-1')).toHaveLength(0)
  })

  it('rejects a wrong password', async () => {
    const { repo, backupCodes, deps } = makeRepos()
    enabledUser(repo)
    await expect(
      new DisableTotpUseCase(repo, hasher, backupCodes, deps, new InMemoryUnitOfWork()).execute({ userId: 'id-1', password: 'wrong', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
    expect((await repo.findById('id-1'))?.isTotpEnabled()).toBe(true)
  })

  it('rejects a wrong code even with correct password', async () => {
    const { repo, backupCodes, deps } = makeRepos()
    enabledUser(repo)
    await expect(
      new DisableTotpUseCase(repo, hasher, backupCodes, deps, new InMemoryUnitOfWork()).execute({ userId: 'id-1', password: 'pw', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('fails when 2FA is not enabled', async () => {
    const { repo, backupCodes, deps } = makeRepos()
    const user = User.create('id-1', 'a@b.com', 'hashed:pw')
    repo.store.set(user.id, user)
    await expect(
      new DisableTotpUseCase(repo, hasher, backupCodes, deps, new InMemoryUnitOfWork()).execute({ userId: 'id-1', password: 'pw', code: '123456' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
