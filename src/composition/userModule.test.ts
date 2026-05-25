import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildUserModule } from './userModule.js'
import { RegisterUserUseCase } from '../contexts/user/application/RegisterUserUseCase.js'
import { LoginUseCase } from '../contexts/user/application/LoginUseCase.js'
import { GetCurrentUserUseCase } from '../contexts/user/application/GetCurrentUserUseCase.js'
import { ChangeOperationModeUseCase } from '../contexts/user/application/ChangeOperationModeUseCase.js'
import { UserRepository } from '../contexts/user/infrastructure/UserRepository.js'

function makeContainer() {
  const logger: any = { debug() {}, info() {}, warn() {}, error() {}, child() { return logger } }
  return {
    pool: { query: () => Promise.resolve({ rows: [] }) } as any,
    logger,
    eventBus: { publish: () => Promise.resolve(), subscribe: () => {} } as any,
    unitOfWork: { run: async (fn: any) => fn({}) } as any,
  }
}

describe('buildUserModule', () => {
  const original = process.env.JWT_SECRET

  beforeEach(() => { process.env.JWT_SECRET = 'test-secret' })
  afterEach(() => {
    if (original === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = original
  })

  it('wires every user use case and exposes the repository + token issuer', () => {
    const mod = buildUserModule(makeContainer())
    expect(mod.registerUser).toBeInstanceOf(RegisterUserUseCase)
    expect(mod.login).toBeInstanceOf(LoginUseCase)
    expect(mod.getCurrentUser).toBeInstanceOf(GetCurrentUserUseCase)
    expect(mod.changeOperationMode).toBeInstanceOf(ChangeOperationModeUseCase)
    expect(mod.userRepository).toBeInstanceOf(UserRepository)
    expect(mod.tokenIssuer).toBeDefined()
  })

  it('throws when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET
    expect(() => buildUserModule(makeContainer())).toThrow('JWT_SECRET is required')
  })
})
