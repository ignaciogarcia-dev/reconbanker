import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import bcrypt from 'bcrypt'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { UserRepository } from '../../../src/contexts/user/infrastructure/UserRepository.js'
import { executorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'
import { BcryptPasswordHasher } from '../../../src/contexts/user/infrastructure/adapters/BcryptPasswordHasher.js'
import { RegisterUserUseCase } from '../../../src/contexts/user/application/RegisterUserUseCase.js'
import { ConflictError } from '../../../src/shared/errors/index.js'

function makeUseCase(): { useCase: RegisterUserUseCase; repo: UserRepository } {
  const repo = new UserRepository(executorFromPool(getTestPool()))
  const hasher = new BcryptPasswordHasher(4)
  const useCase = new RegisterUserUseCase(repo, hasher)
  return { useCase, repo }
}

describe('RegisterUserUseCase (integration)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('registers a user with a bcrypt-hashed password', async () => {
    const { useCase, repo } = makeUseCase()
    const result = await useCase.execute({ email: 'reg@test.com', password: 'plain', name: 'Reg' })

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(result.email).toBe('reg@test.com')

    const stored = await repo.findById(result.id)
    expect(stored).not.toBeNull()
    expect(stored!.passwordHash).not.toBe('plain')
    expect(stored!.passwordHash.length).toBeGreaterThan(20)
    // Verify the stored hash actually matches the plaintext via bcrypt
    expect(await bcrypt.compare('plain', stored!.passwordHash)).toBe(true)
  })

  it('rejects duplicate emails with ConflictError', async () => {
    const { useCase } = makeUseCase()
    await useCase.execute({ email: 'dupe@test.com', password: 'pw1' })
    await expect(
      useCase.execute({ email: 'dupe@test.com', password: 'pw2' })
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('after register, findByEmail finds the user', async () => {
    const { useCase, repo } = makeUseCase()
    await useCase.execute({ email: 'found@test.com', password: 'pw' })
    const found = await repo.findByEmail('found@test.com')
    expect(found).not.toBeNull()
    expect(found!.email).toBe('found@test.com')
  })

  it('treats different-case email as duplicate (because normalized)', async () => {
    const { useCase } = makeUseCase()
    await useCase.execute({ email: 'casing@test.com', password: 'pw1' })
    await expect(
      useCase.execute({ email: 'CASING@TEST.COM', password: 'pw2' })
    ).rejects.toBeInstanceOf(ConflictError)
  })
})
