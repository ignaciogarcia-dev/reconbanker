import { describe, it, expect } from 'vitest'
import { verifyTwoFactorCode, type TwoFactorDeps } from './verifyTwoFactorCode.js'
import { User } from '../domain/User.js'
import { InMemoryBackupCodeRepository } from '../../../../tests/helpers/inMemoryBackupCodeRepo.js'

const hasher = {
  hash: async (plain: string) => `hashed:${plain}`,
  verify: async (plain: string, hash: string) => hash === `hashed:${plain}`,
}

// Accepts '123456' only when the secret matches, mimicking OtplibTotpProvider.
const totp = {
  generateSecret: () => 'SECRET',
  keyUri: () => 'otpauth://totp/x',
  verify: async (secret: string, token: string) => secret === 'SECRET' && token === '123456',
}

function enabledUser(): User {
  const u = User.create('id-1', 'a@b.com', 'hashed:pw')
  u.beginTotpEnrollment('SECRET')
  u.confirmTotp()
  return u
}

function setup() {
  const backupCodes = new InMemoryBackupCodeRepository()
  const deps: TwoFactorDeps = { totp, backupCodes, hasher }
  return { backupCodes, deps }
}

describe('verifyTwoFactorCode', () => {
  it('accepts a valid TOTP code', async () => {
    const { deps } = setup()
    expect(await verifyTwoFactorCode(enabledUser(), '123456', deps)).toBe(true)
  })

  it('trims surrounding whitespace before matching the TOTP code', async () => {
    const { deps } = setup()
    expect(await verifyTwoFactorCode(enabledUser(), '  123456  ', deps)).toBe(true)
  })

  it('accepts a backup code and consumes it (single-use)', async () => {
    const { deps, backupCodes } = setup()
    await backupCodes.replaceForUser('id-1', ['hashed:ABCDEFGHJK'])

    expect(await verifyTwoFactorCode(enabledUser(), 'ABCDE-FGHJK', deps)).toBe(true)
    expect(await backupCodes.listActive('id-1')).toHaveLength(0)
    // second attempt with the same code now fails
    expect(await verifyTwoFactorCode(enabledUser(), 'ABCDE-FGHJK', deps)).toBe(false)
  })

  it('normalizes the backup code before comparing (case/format insensitive)', async () => {
    const { deps, backupCodes } = setup()
    await backupCodes.replaceForUser('id-1', ['hashed:ABCDEFGHJK'])
    expect(await verifyTwoFactorCode(enabledUser(), 'abcde fghjk', deps)).toBe(true)
  })

  it('falls back to backup codes when the user has no TOTP secret', async () => {
    const { deps, backupCodes } = setup()
    await backupCodes.replaceForUser('id-1', ['hashed:ABCDEFGHJK'])
    const u = User.reconstitute('id-1', {
      email: 'a@b.com', name: null, passwordHash: 'hashed:pw',
      operationMode: null, status: 'active', createdAt: new Date(),
      totpSecret: null, totpEnabled: true, totpConfirmedAt: new Date(),
    })
    expect(await verifyTwoFactorCode(u, 'ABCDE-FGHJK', deps)).toBe(true)
  })

  it('returns false for an empty or whitespace-only code', async () => {
    const { deps, backupCodes } = setup()
    await backupCodes.replaceForUser('id-1', ['hashed:ABCDEFGHJK'])
    expect(await verifyTwoFactorCode(enabledUser(), '', deps)).toBe(false)
    expect(await verifyTwoFactorCode(enabledUser(), '   ', deps)).toBe(false)
  })

  it('returns false when neither TOTP nor any backup code matches', async () => {
    const { deps, backupCodes } = setup()
    await backupCodes.replaceForUser('id-1', ['hashed:ABCDEFGHJK'])
    expect(await verifyTwoFactorCode(enabledUser(), 'ZZZZZ-ZZZZZ', deps)).toBe(false)
  })

  it('returns false when there are no active backup codes and TOTP fails', async () => {
    const { deps } = setup()
    expect(await verifyTwoFactorCode(enabledUser(), '000000', deps)).toBe(false)
  })
})
