import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import { buildUserRouter } from './user.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import { NotFoundError } from '../../shared/errors/index.js'
import type { UserModule } from '../../composition/userModule.js'

type MockedUserModule = {
  registerUser: { execute: ReturnType<typeof vi.fn> }
  login: { execute: ReturnType<typeof vi.fn> }
  getCurrentUser: { execute: ReturnType<typeof vi.fn> }
  changeOperationMode: { execute: ReturnType<typeof vi.fn> }
  startTotpEnrollment: { execute: ReturnType<typeof vi.fn> }
  confirmTotpEnrollment: { execute: ReturnType<typeof vi.fn> }
  disableTotp: { execute: ReturnType<typeof vi.fn> }
  userRepository: Record<string, unknown>
  tokenIssuer: Record<string, unknown>
}

function makeUserModule(): MockedUserModule {
  return {
    registerUser: { execute: vi.fn() },
    login: { execute: vi.fn() },
    getCurrentUser: { execute: vi.fn() },
    changeOperationMode: { execute: vi.fn() },
    startTotpEnrollment: { execute: vi.fn() },
    confirmTotpEnrollment: { execute: vi.fn() },
    disableTotp: { execute: vi.fn() },
    userRepository: {},
    tokenIssuer: {},
  }
}

function makeApp(user: MockedUserModule, opts?: { verify?: () => { sub: string; email: string } | null }) {
  return buildTestApp({
    basePath: '/users/me',
    router: buildUserRouter(user as unknown as UserModule),
    protected: true,
    verify: opts?.verify,
  })
}

function makeUnprotectedApp(user: MockedUserModule) {
  return buildTestApp({
    basePath: '/users/me',
    router: buildUserRouter(user as unknown as UserModule),
    protected: false,
  })
}

describe('user.routes', () => {
  let user: MockedUserModule

  beforeEach(() => {
    user = makeUserModule()
  })

  describe('GET /users/me', () => {
    it('returns 200 with the current user on success', async () => {
      user.getCurrentUser.execute.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'Alice',
        operationMode: 'reconcile',
        totpEnabled: true,
      })

      const res = await request(makeApp(user))
        .get('/users/me')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        name: 'Alice',
        operation_mode: 'reconcile',
        totp_enabled: true,
      })
      expect(user.getCurrentUser.execute).toHaveBeenCalledWith('user-1')
    })

    it('returns 401 without a bearer token', async () => {
      const res = await request(makeApp(user)).get('/users/me')

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
      expect(user.getCurrentUser.execute).not.toHaveBeenCalled()
    })

    it('returns 401 when the token verifier rejects', async () => {
      const res = await request(makeApp(user, { verify: () => null }))
        .get('/users/me')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: { code: 'INVALID_TOKEN', message: 'Invalid token' } })
    })

    it('returns 401 from requireUserId when req.userId is missing', async () => {
      const res = await request(makeUnprotectedApp(user)).get('/users/me')

      expect(res.status).toBe(401)
      expect(res.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      })
    })

    it('returns 404 when the use case throws NotFoundError', async () => {
      user.getCurrentUser.execute.mockRejectedValue(new NotFoundError('User not found'))

      const res = await request(makeApp(user))
        .get('/users/me')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(404)
      expect(res.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      })
    })

    it('returns 500 on unexpected errors', async () => {
      user.getCurrentUser.execute.mockRejectedValue(new Error('db down'))

      const res = await request(makeApp(user))
        .get('/users/me')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('PUT /users/me/operation-mode', () => {
    it('returns 200 with the new operation mode on success', async () => {
      user.changeOperationMode.execute.mockResolvedValue({ mode: 'passthrough' })

      const res = await request(makeApp(user))
        .put('/users/me/operation-mode')
        .set('Authorization', AUTH_HEADER)
        .send({ mode: 'passthrough' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ operation_mode: 'passthrough' })
      expect(user.changeOperationMode.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        mode: 'passthrough',
      })
    })

    it('accepts the reconcile mode', async () => {
      user.changeOperationMode.execute.mockResolvedValue({ mode: 'reconcile' })

      const res = await request(makeApp(user))
        .put('/users/me/operation-mode')
        .set('Authorization', AUTH_HEADER)
        .send({ mode: 'reconcile' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ operation_mode: 'reconcile' })
    })

    it('returns 401 without a bearer token', async () => {
      const res = await request(makeApp(user))
        .put('/users/me/operation-mode')
        .send({ mode: 'reconcile' })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
    })

    it('returns 401 from requireUserId when req.userId is missing', async () => {
      const res = await request(makeUnprotectedApp(user))
        .put('/users/me/operation-mode')
        .send({ mode: 'reconcile' })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      })
      expect(user.changeOperationMode.execute).not.toHaveBeenCalled()
    })

    it('returns 400 when mode is not in the enum', async () => {
      const res = await request(makeApp(user))
        .put('/users/me/operation-mode')
        .set('Authorization', AUTH_HEADER)
        .send({ mode: 'invalid' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.message).toBe('Invalid body')
      expect(user.changeOperationMode.execute).not.toHaveBeenCalled()
    })

    it('returns 400 when mode is missing', async () => {
      const res = await request(makeApp(user))
        .put('/users/me/operation-mode')
        .set('Authorization', AUTH_HEADER)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 404 when the use case throws NotFoundError', async () => {
      user.changeOperationMode.execute.mockRejectedValue(new NotFoundError('User not found'))

      const res = await request(makeApp(user))
        .put('/users/me/operation-mode')
        .set('Authorization', AUTH_HEADER)
        .send({ mode: 'reconcile' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      })
    })

    it('returns 500 on unexpected errors', async () => {
      user.changeOperationMode.execute.mockRejectedValue(new Error('event bus down'))

      const res = await request(makeApp(user))
        .put('/users/me/operation-mode')
        .set('Authorization', AUTH_HEADER)
        .send({ mode: 'reconcile' })

      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('POST /users/me/2fa/enroll', () => {
    it('returns the otpauth uri', async () => {
      user.startTotpEnrollment.execute.mockResolvedValue({ otpauthUri: 'otpauth://totp/x' })

      const res = await request(makeApp(user))
        .post('/users/me/2fa/enroll')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ otpauth_uri: 'otpauth://totp/x' })
      expect(user.startTotpEnrollment.execute).toHaveBeenCalledWith('user-1')
    })

    it('returns 401 without a bearer token', async () => {
      const res = await request(makeApp(user)).post('/users/me/2fa/enroll')
      expect(res.status).toBe(401)
      expect(user.startTotpEnrollment.execute).not.toHaveBeenCalled()
    })
  })

  describe('POST /users/me/2fa/confirm', () => {
    it('returns backup codes on success', async () => {
      user.confirmTotpEnrollment.execute.mockResolvedValue({ backupCodes: ['AAAAA-BBBBB'] })

      const res = await request(makeApp(user))
        .post('/users/me/2fa/confirm')
        .set('Authorization', AUTH_HEADER)
        .send({ code: '123456' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ backup_codes: ['AAAAA-BBBBB'] })
      expect(user.confirmTotpEnrollment.execute).toHaveBeenCalledWith({ userId: 'user-1', code: '123456' })
    })

    it('returns 400 when code is missing', async () => {
      const res = await request(makeApp(user))
        .post('/users/me/2fa/confirm')
        .set('Authorization', AUTH_HEADER)
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(user.confirmTotpEnrollment.execute).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /users/me/2fa', () => {
    it('returns 204 on success', async () => {
      user.disableTotp.execute.mockResolvedValue(undefined)

      const res = await request(makeApp(user))
        .delete('/users/me/2fa')
        .set('Authorization', AUTH_HEADER)
        .send({ password: 'pw', code: '123456' })

      expect(res.status).toBe(204)
      expect(user.disableTotp.execute).toHaveBeenCalledWith({ userId: 'user-1', password: 'pw', code: '123456' })
    })

    it('returns 400 when password or code is missing', async () => {
      const res = await request(makeApp(user))
        .delete('/users/me/2fa')
        .set('Authorization', AUTH_HEADER)
        .send({ password: 'pw' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(user.disableTotp.execute).not.toHaveBeenCalled()
    })
  })
})
