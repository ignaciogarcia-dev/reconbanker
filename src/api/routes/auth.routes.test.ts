import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildAuthRouter } from './auth.routes.js'
import { buildTestApp } from '../../../tests/helpers/buildTestApp.js'
import { ConflictError, UnauthorizedError } from '../../shared/errors/index.js'
import type { UserModule } from '../../composition/userModule.js'

type MockedUserModule = {
  registerUser: { execute: ReturnType<typeof vi.fn> }
  login: { execute: ReturnType<typeof vi.fn> }
  getCurrentUser: { execute: ReturnType<typeof vi.fn> }
  changeOperationMode: { execute: ReturnType<typeof vi.fn> }
  userRepository: Record<string, unknown>
  tokenIssuer: Record<string, unknown>
}

function makeUserModule(): MockedUserModule {
  return {
    registerUser: { execute: vi.fn() },
    login: { execute: vi.fn() },
    getCurrentUser: { execute: vi.fn() },
    changeOperationMode: { execute: vi.fn() },
    userRepository: {},
    tokenIssuer: {},
  }
}

function makeApp(user: MockedUserModule) {
  return buildTestApp({
    basePath: '/auth',
    router: buildAuthRouter(user as unknown as UserModule),
  })
}

describe('auth.routes', () => {
  let user: MockedUserModule

  beforeEach(() => {
    user = makeUserModule()
  })

  describe('POST /auth/register', () => {
    it('returns 201 with the use case result on valid body', async () => {
      user.registerUser.execute.mockResolvedValue({ id: 'id-1', email: 'a@b.com' })

      const res = await request(makeApp(user))
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'secret', name: 'Alice' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: 'id-1', email: 'a@b.com' })
      expect(user.registerUser.execute).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'secret',
        name: 'Alice',
      })
    })

    it('accepts a body without name (optional)', async () => {
      user.registerUser.execute.mockResolvedValue({ id: 'id-2', email: 'b@c.com' })

      const res = await request(makeApp(user))
        .post('/auth/register')
        .send({ email: 'b@c.com', password: 'secret' })

      expect(res.status).toBe(201)
      expect(user.registerUser.execute).toHaveBeenCalledWith({
        email: 'b@c.com',
        password: 'secret',
        name: undefined,
      })
    })

    it('returns 400 when email is invalid', async () => {
      const res = await request(makeApp(user))
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'secret' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toBe('Invalid body')
      expect(res.body.error.details.source).toBe('body')
      expect(user.registerUser.execute).not.toHaveBeenCalled()
    })

    it('returns 400 when password is missing', async () => {
      const res = await request(makeApp(user))
        .post('/auth/register')
        .send({ email: 'a@b.com' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when types are wrong', async () => {
      const res = await request(makeApp(user))
        .post('/auth/register')
        .send({ email: 123, password: 'secret' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 409 when the use case throws ConflictError', async () => {
      user.registerUser.execute.mockRejectedValue(
        new ConflictError('Email already exists', { email: 'a@b.com' }),
      )

      const res = await request(makeApp(user))
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'secret' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({
        error: {
          code: 'CONFLICT',
          message: 'Email already exists',
          details: { email: 'a@b.com' },
        },
      })
    })

    it('returns 500 on unexpected errors', async () => {
      user.registerUser.execute.mockRejectedValue(new Error('boom'))

      const res = await request(makeApp(user))
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'secret' })

      expect(res.status).toBe(500)
      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      })
    })
  })

  describe('POST /auth/login', () => {
    it('returns 200 with token and user on valid credentials', async () => {
      user.login.execute.mockResolvedValue({
        token: 'jwt-token',
        user: { id: 'id-1', email: 'a@b.com', name: 'Alice' },
      })

      const res = await request(makeApp(user))
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'secret' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        token: 'jwt-token',
        user: { id: 'id-1', email: 'a@b.com', name: 'Alice' },
      })
      expect(user.login.execute).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'secret',
      })
    })

    it('returns 400 when email is invalid', async () => {
      const res = await request(makeApp(user))
        .post('/auth/login')
        .send({ email: 'bad', password: 'secret' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(user.login.execute).not.toHaveBeenCalled()
    })

    it('returns 400 when password is empty', async () => {
      const res = await request(makeApp(user))
        .post('/auth/login')
        .send({ email: 'a@b.com', password: '' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 401 when the use case throws UnauthorizedError', async () => {
      user.login.execute.mockRejectedValue(new UnauthorizedError('Invalid credentials'))

      const res = await request(makeApp(user))
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'wrong' })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      })
    })

    it('returns 500 on unexpected errors', async () => {
      user.login.execute.mockRejectedValue(new Error('kaboom'))

      const res = await request(makeApp(user))
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'secret' })

      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
