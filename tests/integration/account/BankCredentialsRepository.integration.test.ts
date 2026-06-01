import { describe, it, expect, afterAll, beforeEach } from 'vitest'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount } from '../helpers/seed.js'
import { BankCredentialsRepository } from '../../../src/contexts/account/infrastructure/BankCredentialsRepository.js'
import { executorFromPool } from '../../../src/contexts/account/infrastructure/Executor.js'
import { credentialsCipher } from '../../../src/shared/infrastructure/crypto/CredentialsCipher.js'

describe('BankCredentialsRepository (integration)', () => {
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  function makeRepo() {
    return new BankCredentialsRepository(executorFromPool(getTestPool()))
  }

  describe('findUsernameByAccount', () => {
    it('returns the username when credentials are valid', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert({ accountId: acc.id, username: 'alice', encryptedPassword: 'enc' })

      expect(await repo.findUsernameByAccount(acc.id)).toBe('alice')
    })

    it('returns null when credentials are invalid', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert({ accountId: acc.id, username: 'alice', encryptedPassword: 'enc' })
      await getTestPool().query(`UPDATE bank_credentials SET status='invalid' WHERE account_id=$1`, [acc.id])

      expect(await repo.findUsernameByAccount(acc.id)).toBeNull()
    })

    it('returns null when no credentials exist', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      expect(await repo.findUsernameByAccount(acc.id)).toBeNull()
    })
  })

  describe('upsert', () => {
    it('inserts credentials with status=valid', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert({ accountId: acc.id, username: '  bob  ', encryptedPassword: 'enc' })

      const rec = await repo.findByAccountId(acc.id)
      expect(rec?.username).toBe('bob') // trimmed
      expect(rec?.status).toBe('valid')
    })

    it('is idempotent: updates on conflict and only keeps a single row', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert({ accountId: acc.id, username: 'alice', encryptedPassword: 'enc-1' })
      await repo.upsert({ accountId: acc.id, username: 'alice2', encryptedPassword: 'enc-2' })

      const { rows } = await getTestPool().query(
        'SELECT username, encrypted_password, status FROM bank_credentials WHERE account_id=$1',
        [acc.id]
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].username).toBe('alice2')
      // Stored encrypted at rest, not in plaintext, but decrypts to the original.
      expect(rows[0].encrypted_password).not.toBe('enc-2')
      expect(credentialsCipher().decrypt(rows[0].encrypted_password)).toBe('enc-2')
      expect(rows[0].status).toBe('valid')
    })

    it('resets status back to valid after an invalid-status row is re-upserted', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert({ accountId: acc.id, username: 'alice', encryptedPassword: 'enc' })
      await getTestPool().query(`UPDATE bank_credentials SET status='invalid' WHERE account_id=$1`, [acc.id])
      await repo.upsert({ accountId: acc.id, username: 'alice', encryptedPassword: 'enc' })

      const rec = await repo.findByAccountId(acc.id)
      expect(rec?.status).toBe('valid')
    })
  })

  describe('findByAccountId', () => {
    it('returns null when no record exists', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      expect(await repo.findByAccountId(acc.id)).toBeNull()
    })

    it('returns the full record', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert({ accountId: acc.id, username: 'alice', encryptedPassword: 'enc' })

      const rec = await repo.findByAccountId(acc.id)
      expect(rec).toMatchObject({
        accountId: acc.id,
        username: 'alice',
        status: 'valid',
      })
    })
  })

  describe('deleteByAccountId', () => {
    it('removes the credentials record', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await repo.upsert({ accountId: acc.id, username: 'alice', encryptedPassword: 'enc' })
      await repo.deleteByAccountId(acc.id)

      expect(await repo.findByAccountId(acc.id)).toBeNull()
    })

    it('is a no-op when no record exists', async () => {
      const user = await seedUser()
      const acc = await seedAccount(user.id)
      const repo = makeRepo()
      await expect(repo.deleteByAccountId(acc.id)).resolves.toBeUndefined()
    })
  })
})
