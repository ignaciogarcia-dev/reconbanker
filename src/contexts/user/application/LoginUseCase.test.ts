import { describe, it, expect } from 'vitest'
import { LoginUseCase } from './LoginUseCase.js'
import { User } from '../domain/User.js'
import { InMemoryUserRepository } from '../../../../tests/helpers/inMemoryUserRepo.js'
import { UnauthorizedError } from '../../../shared/errors/index.js'

const fakeHasher = {
  hash: async (plain: string) => `hashed:${plain}`,
  verify: async (plain: string, hash: string) => hash === `hashed:${plain}`,
}
const fakeIssuer = {
  issue: (payload: { sub: string; email: string }) => `token-for-${payload.sub}`,
  verify: () => null,
}

describe('LoginUseCase', () => {
  it('issues a token on valid credentials', async () => {
    const repo = new InMemoryUserRepository()
    const user = User.create('id-1', 'alice@example.com', 'hashed:secret', 'Alice')
    repo.store.set(user.id, user)
    const useCase = new LoginUseCase(repo, fakeHasher, fakeIssuer)
    const result = await useCase.execute({ email: 'alice@example.com', password: 'secret' })
    expect(result.token).toBe('token-for-id-1')
    expect(result.user.email).toBe('alice@example.com')
  })

  it('rejects unknown email with UnauthorizedError', async () => {
    const repo = new InMemoryUserRepository()
    const useCase = new LoginUseCase(repo, fakeHasher, fakeIssuer)
    await expect(
      useCase.execute({ email: 'nobody@example.com', password: 'x' })
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('rejects bad password with UnauthorizedError', async () => {
    const repo = new InMemoryUserRepository()
    const user = User.create('id-1', 'alice@example.com', 'hashed:correct')
    repo.store.set(user.id, user)
    const useCase = new LoginUseCase(repo, fakeHasher, fakeIssuer)
    await expect(
      useCase.execute({ email: 'alice@example.com', password: 'wrong' })
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
