import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { generateSync } from 'otplib'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser } from '../helpers/seed.js'
import { executorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'
import { UserRepository } from '../../../src/contexts/user/infrastructure/UserRepository.js'
import { BcryptPasswordHasher } from '../../../src/contexts/user/infrastructure/adapters/BcryptPasswordHasher.js'
import { OtplibTotpProvider } from '../../../src/contexts/user/infrastructure/adapters/OtplibTotpProvider.js'
import { StartTotpEnrollmentUseCase } from '../../../src/contexts/user/application/StartTotpEnrollmentUseCase.js'
import { ConfirmTotpEnrollmentUseCase } from '../../../src/contexts/user/application/ConfirmTotpEnrollmentUseCase.js'
import { PgUnitOfWork } from '../../../src/shared/persistence/PgUnitOfWork.js'

const secretFromUri = (uri: string) => new URL(uri).searchParams.get('secret')!

describe('TOTP enrollment atomicity (M2)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('rolls back enabling 2FA when persisting the backup codes fails', async () => {
    const seeded = await seedUser({ email: 'atomic@test.com' })
    const exec = executorFromPool(getTestPool())
    const userRepo = new UserRepository(exec)
    const totp = new OtplibTotpProvider()

    const { otpauthUri } = await new StartTotpEnrollmentUseCase(userRepo, totp).execute(seeded.id)
    const secret = secretFromUri(otpauthUri)

    // Backup-code persistence fails mid-transaction.
    const failingBackupCodes: any = {
      withTx: () => failingBackupCodes,
      replaceForUser: async () => { throw new Error('backup insert failed') },
    }
    const confirm = new ConfirmTotpEnrollmentUseCase(
      userRepo, totp, failingBackupCodes, new BcryptPasswordHasher(4), new PgUnitOfWork(getTestPool()),
    )

    await expect(
      confirm.execute({ userId: seeded.id, code: generateSync({ secret }) }),
    ).rejects.toThrow(/backup insert failed/)

    // The user must NOT be left with 2FA enabled and zero backup codes.
    const after = await userRepo.findById(seeded.id)
    expect(after!.isTotpEnabled()).toBe(false)
    const { rows } = await getTestPool().query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM user_backup_codes WHERE user_id = $1', [seeded.id]
    )
    expect(rows[0].n).toBe(0)
  })
})
