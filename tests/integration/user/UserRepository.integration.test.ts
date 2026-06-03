import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser } from '../helpers/seed.js'
import { UserRepository } from '../../../src/contexts/user/infrastructure/UserRepository.js'
import { executorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'
import { User } from '../../../src/contexts/user/domain/User.js'
import { txFromClient } from '../../../src/shared/persistence/Tx.js'

function makeRepo(): UserRepository {
  return new UserRepository(executorFromPool(getTestPool()))
}

describe('UserRepository (integration)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  describe('findById', () => {
    it('returns user when it exists', async () => {
      const seeded = await seedUser({ email: 'find-by-id@test.com' })
      const repo = makeRepo()
      const user = await repo.findById(seeded.id)
      expect(user).not.toBeNull()
      expect(user!.id).toBe(seeded.id)
      expect(user!.email).toBe('find-by-id@test.com')
    })

    it('returns null when id does not exist', async () => {
      const repo = makeRepo()
      const user = await repo.findById(crypto.randomUUID())
      expect(user).toBeNull()
    })
  })

  describe('findByEmail', () => {
    it('returns user when email exists', async () => {
      await seedUser({ email: 'find-by-email@test.com' })
      const repo = makeRepo()
      const user = await repo.findByEmail('find-by-email@test.com')
      expect(user).not.toBeNull()
      expect(user!.email).toBe('find-by-email@test.com')
    })

    it('returns null when email does not exist', async () => {
      const repo = makeRepo()
      const user = await repo.findByEmail('nope@test.com')
      expect(user).toBeNull()
    })

    it('normalizes the email by lowercasing it', async () => {
      await seedUser({ email: 'mixedcase@test.com' })
      const repo = makeRepo()
      const user = await repo.findByEmail('MIXEDCASE@TEST.COM')
      expect(user).not.toBeNull()
      expect(user!.email).toBe('mixedcase@test.com')
    })

    it('ignores users with status=inactive', async () => {
      const seeded = await seedUser({ email: 'inactive@test.com' })
      await getTestPool().query(`UPDATE users SET status = 'inactive' WHERE id = $1`, [seeded.id])
      const repo = makeRepo()
      const user = await repo.findByEmail('inactive@test.com')
      expect(user).toBeNull()
    })
  })

  describe('save', () => {
    it('creates a new user', async () => {
      const repo = makeRepo()
      const user = User.create(crypto.randomUUID(), 'new@test.com', 'hash-here', 'New User')
      await repo.save(user)

      const found = await repo.findById(user.id)
      expect(found).not.toBeNull()
      expect(found!.email).toBe('new@test.com')
      expect(found!.passwordHash).toBe('hash-here')
      expect(found!.name).toBe('New User')
    })

    it('updates on conflict (idempotency via ON CONFLICT)', async () => {
      const repo = makeRepo()
      const id = crypto.randomUUID()
      const user = User.create(id, 'original@test.com', 'hash1')
      await repo.save(user)

      // Reconstitute with mutated fields
      const updated = User.reconstitute(id, {
        email: 'updated@test.com',
        name: 'Updated Name',
        passwordHash: 'hash2',
        operationMode: 'reconcile',
        status: 'active',
        createdAt: user.createdAt,
      })
      await repo.save(updated)

      const found = await repo.findById(id)
      expect(found!.email).toBe('updated@test.com')
      expect(found!.name).toBe('Updated Name')
      expect(found!.passwordHash).toBe('hash2')
      expect(found!.operationMode).toBe('reconcile')

      // Still only one row
      const { rows } = await getTestPool().query<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM users WHERE id = $1', [id]
      )
      expect(rows[0].n).toBe(1)
    })
  })

  describe('TOTP secret encryption at rest', () => {
    it('stores the secret encrypted (enc:v1:) and returns it decrypted', async () => {
      const repo = makeRepo()
      const user = User.create(crypto.randomUUID(), 'totp@test.com', 'hash')
      user.beginTotpEnrollment('JBSWY3DPEHPK3PXP')
      user.confirmTotp()
      await repo.save(user)

      // Raw column is ciphertext, never the plaintext secret.
      const { rows } = await getTestPool().query<{ totp_secret: string; totp_enabled: boolean }>(
        'SELECT totp_secret, totp_enabled FROM users WHERE id = $1', [user.id]
      )
      expect(rows[0].totp_secret.startsWith('enc:v1:')).toBe(true)
      expect(rows[0].totp_secret).not.toContain('JBSWY3DPEHPK3PXP')
      expect(rows[0].totp_enabled).toBe(true)

      // Repository decrypts on read.
      const byId = await repo.findById(user.id)
      expect(byId!.totpSecret).toBe('JBSWY3DPEHPK3PXP')
      expect(byId!.isTotpEnabled()).toBe(true)
      expect(byId!.totpConfirmedAt).toBeInstanceOf(Date)

      const byEmail = await repo.findByEmail('totp@test.com')
      expect(byEmail!.totpSecret).toBe('JBSWY3DPEHPK3PXP')
    })

    it('round-trips a null secret as null (no 2FA)', async () => {
      const repo = makeRepo()
      const user = User.create(crypto.randomUUID(), 'no-totp@test.com', 'hash')
      await repo.save(user)

      const { rows } = await getTestPool().query<{ totp_secret: string | null }>(
        'SELECT totp_secret FROM users WHERE id = $1', [user.id]
      )
      expect(rows[0].totp_secret).toBeNull()

      const found = await repo.findById(user.id)
      expect(found!.totpSecret).toBeNull()
      expect(found!.isTotpEnabled()).toBe(false)
    })

    it('clears the secret on disable (save after disableTotp)', async () => {
      const repo = makeRepo()
      const user = User.create(crypto.randomUUID(), 'disable@test.com', 'hash')
      user.beginTotpEnrollment('JBSWY3DPEHPK3PXP')
      user.confirmTotp()
      await repo.save(user)
      user.disableTotp()
      await repo.save(user)

      const found = await repo.findById(user.id)
      expect(found!.totpSecret).toBeNull()
      expect(found!.isTotpEnabled()).toBe(false)
      expect(found!.totpConfirmedAt).toBeNull()
    })
  })

  describe('getOperationMode / setOperationMode', () => {
    it('returns null when user has no operation mode yet', async () => {
      const seeded = await seedUser({ email: 'no-mode@test.com' })
      const repo = makeRepo()
      const mode = await repo.getOperationMode(seeded.id)
      expect(mode).toBeNull()
    })

    it('persists the operation mode and reads it back', async () => {
      const seeded = await seedUser({ email: 'mode@test.com' })
      const repo = makeRepo()
      await repo.setOperationMode(seeded.id, 'passthrough')
      const mode = await repo.getOperationMode(seeded.id)
      expect(mode).toBe('passthrough')
    })

    it('returns null when user does not exist', async () => {
      const repo = makeRepo()
      const mode = await repo.getOperationMode(crypto.randomUUID())
      expect(mode).toBeNull()
    })
  })

  describe('withTx', () => {
    it('uses the transactional executor — ROLLBACK does not persist', async () => {
      const id = crypto.randomUUID()
      const pool = getTestPool()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const tx = txFromClient(client)
        const baseRepo = makeRepo()
        const txRepo = baseRepo.withTx(tx)

        const user = User.create(id, 'tx@test.com', 'hash')
        await txRepo.save(user)

        // Visible inside the tx
        const inside = await txRepo.findById(id)
        expect(inside).not.toBeNull()

        // Not visible outside the tx (pool repo) before commit
        const outside = await baseRepo.findById(id)
        expect(outside).toBeNull()

        await client.query('ROLLBACK')
      } finally {
        client.release()
      }

      // Confirm nothing was persisted
      const repo = makeRepo()
      const after = await repo.findById(id)
      expect(after).toBeNull()
    })

    it('commits within the tx are visible afterwards', async () => {
      const id = crypto.randomUUID()
      const pool = getTestPool()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const tx = txFromClient(client)
        const txRepo = makeRepo().withTx(tx)
        const user = User.create(id, 'tx-commit@test.com', 'hash')
        await txRepo.save(user)
        await client.query('COMMIT')
      } finally {
        client.release()
      }
      const found = await makeRepo().findById(id)
      expect(found).not.toBeNull()
      expect(found!.email).toBe('tx-commit@test.com')
    })
  })
})
