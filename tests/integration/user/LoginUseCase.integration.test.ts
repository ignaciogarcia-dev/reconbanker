import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import jwt from 'jsonwebtoken'
import { truncateAll, closeTestPool, getTestPool } from '../helpers/testDb.js'
import { seedUser } from '../helpers/seed.js'
import { UserRepository } from '../../../src/contexts/user/infrastructure/UserRepository.js'
import { executorFromPool } from '../../../src/contexts/user/infrastructure/Executor.js'
import { BcryptPasswordHasher } from '../../../src/contexts/user/infrastructure/adapters/BcryptPasswordHasher.js'
import { JwtTokenIssuer } from '../../../src/contexts/user/infrastructure/adapters/JwtTokenIssuer.js'
import { LoginUseCase, isTotpChallenge } from '../../../src/contexts/user/application/LoginUseCase.js'
import { UnauthorizedError } from '../../../src/shared/errors/index.js'

const SECRET = 'test-secret'

function makeUseCase(): LoginUseCase {
  const repo = new UserRepository(executorFromPool(getTestPool()))
  const hasher = new BcryptPasswordHasher(4)
  const tokenIssuer = new JwtTokenIssuer(SECRET)
  return new LoginUseCase(repo, hasher, tokenIssuer)
}

describe('LoginUseCase (integration)', () => {
  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await closeTestPool() })

  it('logs in with correct credentials and returns a valid JWT', async () => {
    const user = await seedUser({ email: 'login@test.com', password: 'secret-pw' })
    const useCase = makeUseCase()

    const result = await useCase.execute({ email: 'login@test.com', password: 'secret-pw' })
    if (isTotpChallenge(result)) throw new Error('expected a session token')

    expect(result.user.id).toBe(user.id)
    expect(result.user.email).toBe('login@test.com')
    expect(typeof result.token).toBe('string')
    expect(result.token.split('.').length).toBe(3) // header.payload.signature

    const decoded = jwt.verify(result.token, SECRET) as jwt.JwtPayload
    expect(decoded.sub).toBe(user.id)
    expect(decoded.email).toBe('login@test.com')
  })

  it('rejects wrong password with UnauthorizedError', async () => {
    await seedUser({ email: 'wrong-pw@test.com', password: 'right-pw' })
    const useCase = makeUseCase()

    await expect(
      useCase.execute({ email: 'wrong-pw@test.com', password: 'wrong-pw' })
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('rejects unknown email with UnauthorizedError', async () => {
    const useCase = makeUseCase()
    await expect(
      useCase.execute({ email: 'nobody@test.com', password: 'whatever' })
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('normalizes email casing on login', async () => {
    await seedUser({ email: 'casing-login@test.com', password: 'pw' })
    const useCase = makeUseCase()
    const result = await useCase.execute({ email: 'CASING-LOGIN@TEST.COM', password: 'pw' })
    if (isTotpChallenge(result)) throw new Error('expected a session token')
    expect(result.user.email).toBe('casing-login@test.com')
  })
})
