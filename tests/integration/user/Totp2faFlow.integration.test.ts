import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { generateSync } from 'otplib'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser } from '../helpers/seed.js'
import { executorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'
import { UserRepository } from '../../../src/contexts/user/infrastructure/UserRepository.js'
import { BackupCodeRepository } from '../../../src/contexts/user/infrastructure/BackupCodeRepository.js'
import { BcryptPasswordHasher } from '../../../src/contexts/user/infrastructure/adapters/BcryptPasswordHasher.js'
import { JwtTokenIssuer } from '../../../src/contexts/user/infrastructure/adapters/JwtTokenIssuer.js'
import { OtplibTotpProvider } from '../../../src/contexts/user/infrastructure/adapters/OtplibTotpProvider.js'
import { PgUnitOfWork } from '../../../src/shared/persistence/PgUnitOfWork.js'
import { StartTotpEnrollmentUseCase } from '../../../src/contexts/user/application/StartTotpEnrollmentUseCase.js'
import { ConfirmTotpEnrollmentUseCase } from '../../../src/contexts/user/application/ConfirmTotpEnrollmentUseCase.js'
import { DisableTotpUseCase } from '../../../src/contexts/user/application/DisableTotpUseCase.js'
import { LoginUseCase, isTotpChallenge } from '../../../src/contexts/user/application/LoginUseCase.js'
import { VerifyTotpLoginUseCase } from '../../../src/contexts/user/application/VerifyTotpLoginUseCase.js'
import type { TwoFactorDeps } from '../../../src/contexts/user/application/verifyTwoFactorCode.js'
import { UnauthorizedError } from '../../../src/shared/errors/index.js'

const SECRET = 'test-secret'

function build() {
  const exec = executorFromPool(getTestPool())
  const userRepo = new UserRepository(exec)
  const backupCodes = new BackupCodeRepository(exec)
  const hasher = new BcryptPasswordHasher(4)
  const totp = new OtplibTotpProvider()
  const issuer = new JwtTokenIssuer(SECRET)
  const twoFactor: TwoFactorDeps = { totp, backupCodes, hasher }
  const uow = new PgUnitOfWork(getTestPool())
  return {
    userRepo, backupCodes, totp, issuer,
    start: new StartTotpEnrollmentUseCase(userRepo, totp),
    confirm: new ConfirmTotpEnrollmentUseCase(userRepo, totp, backupCodes, hasher, uow),
    disable: new DisableTotpUseCase(userRepo, hasher, backupCodes, twoFactor, uow),
    login: new LoginUseCase(userRepo, hasher, issuer),
    verify: new VerifyTotpLoginUseCase(userRepo, issuer, twoFactor),
  }
}

const secretFromUri = (uri: string) => new URL(uri).searchParams.get('secret')!

describe('TOTP 2FA flow (integration)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('runs the full enroll → login → verify (TOTP & backup) → disable lifecycle', async () => {
    // Fake only the clock (leave I/O timers real for pg) so we can step into a
    // fresh TOTP window between enrollment and login — the enrollment code is now
    // consumed (replay protection), so the same-window code can't log in.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const password = 'SuperSecret123'
    const seeded = await seedUser({ email: 'flow@test.com', password })
    const m = build()

    // --- enroll + confirm ---
    const { otpauthUri } = await m.start.execute(seeded.id)
    const secret = secretFromUri(otpauthUri)
    const { backupCodes } = await m.confirm.execute({ userId: seeded.id, code: generateSync({ secret }) })
    expect(backupCodes).toHaveLength(10)

    // --- login now requires a second factor ---
    const challenge = await m.login.execute({ email: 'flow@test.com', password })
    if (!isTotpChallenge(challenge)) throw new Error('expected a 2FA challenge')
    expect(challenge.challengeToken).toBeTruthy()

    // the challenge token must NOT verify as an access token
    expect(m.issuer.verify(challenge.challengeToken)?.scope).toBe('2fa_pending')

    // --- complete with a TOTP code from a later window (enrollment step consumed) ---
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'))
    const session = await m.verify.execute({
      challengeToken: challenge.challengeToken,
      code: generateSync({ secret }),
    })
    expect(session.token).toBeTruthy()
    expect(m.issuer.verify(session.token)?.scope).toBe('access')

    // --- complete with a BACKUP code (single-use) ---
    const challenge2 = await m.login.execute({ email: 'flow@test.com', password })
    if (!isTotpChallenge(challenge2)) throw new Error('expected a 2FA challenge')
    const viaBackup = await m.verify.execute({ challengeToken: challenge2.challengeToken, code: backupCodes[0] })
    expect(viaBackup.token).toBeTruthy()

    // reusing the same backup code fails
    const challenge3 = await m.login.execute({ email: 'flow@test.com', password })
    if (!isTotpChallenge(challenge3)) throw new Error('expected a 2FA challenge')
    await expect(
      m.verify.execute({ challengeToken: challenge3.challengeToken, code: backupCodes[0] }),
    ).rejects.toBeInstanceOf(UnauthorizedError)

    // --- disable requires password + a valid code ---
    // Use an unused backup code: the current TOTP step was already consumed by
    // the login above, and replay protection (single-use per window) would
    // reject the same code here.
    await m.disable.execute({ userId: seeded.id, password, code: backupCodes[1] })

    const after = await m.userRepo.findById(seeded.id)
    expect(after!.isTotpEnabled()).toBe(false)
    expect(after!.totpSecret).toBeNull()

    // backup codes were wiped
    const { rows } = await getTestPool().query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM user_backup_codes WHERE user_id = $1', [seeded.id]
    )
    expect(rows[0].n).toBe(0)

    // login no longer challenges
    const plainLogin = await m.login.execute({ email: 'flow@test.com', password })
    expect(isTotpChallenge(plainLogin)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects disabling 2FA with a wrong password', async () => {
    const password = 'SuperSecret123'
    const seeded = await seedUser({ email: 'flow-wrongpw@test.com', password })
    const m = build()
    const { otpauthUri } = await m.start.execute(seeded.id)
    const secret = secretFromUri(otpauthUri)
    await m.confirm.execute({ userId: seeded.id, code: generateSync({ secret }) })

    await expect(
      m.disable.execute({ userId: seeded.id, password: 'WrongPass999', code: generateSync({ secret }) }),
    ).rejects.toBeInstanceOf(UnauthorizedError)

    const stillOn = await m.userRepo.findById(seeded.id)
    expect(stillOn!.isTotpEnabled()).toBe(true)
  })
})
