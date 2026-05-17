import { describe, it, expect } from 'vitest'
import { RegisterUserUseCase } from './RegisterUserUseCase.js'
import { User } from '../domain/User.js'
import { InMemoryUserRepository } from '../../../../tests/helpers/inMemoryUserRepo.js'
import { ConflictError } from '../../../shared/errors/index.js'

const fakeHasher = {
  hash: async (plain: string) => `hashed:${plain}`,
  verify: async (plain: string, hash: string) => hash === `hashed:${plain}`,
}

describe('RegisterUserUseCase', () => {
  it('creates a user and stores the hashed password', async () => {
    const repo = new InMemoryUserRepository()
    const useCase = new RegisterUserUseCase(repo, fakeHasher)
    const result = await useCase.execute({ email: 'Alice@Example.com', password: 'secret', name: 'Alice' })
    expect(result.email).toBe('alice@example.com')
    const stored = await repo.findByEmail('alice@example.com')
    expect(stored?.passwordHash).toBe('hashed:secret')
  })

  it('throws ConflictError when email is taken', async () => {
    const repo = new InMemoryUserRepository()
    const existing = User.create('id-1', 'alice@example.com', 'h')
    repo.store.set(existing.id, existing)
    const useCase = new RegisterUserUseCase(repo, fakeHasher)
    await expect(
      useCase.execute({ email: 'alice@example.com', password: 'secret' })
    ).rejects.toBeInstanceOf(ConflictError)
  })
})
