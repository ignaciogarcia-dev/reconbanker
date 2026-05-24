import { describe, expect, it } from 'vitest'
import { ConflictError } from './ConflictError.js'
import { DomainError } from './DomainError.js'
import { ForbiddenError } from './ForbiddenError.js'
import { NotFoundError } from './NotFoundError.js'
import { UnauthorizedError } from './UnauthorizedError.js'
import { ValidationError } from './ValidationError.js'

describe('shared errors', () => {
  const cases = [
    { Cls: ConflictError, code: 'CONFLICT', statusCode: 409 },
    { Cls: ForbiddenError, code: 'FORBIDDEN', statusCode: 403 },
    { Cls: NotFoundError, code: 'NOT_FOUND', statusCode: 404 },
    { Cls: UnauthorizedError, code: 'UNAUTHORIZED', statusCode: 401 },
    { Cls: ValidationError, code: 'VALIDATION_ERROR', statusCode: 400 },
  ] as const

  for (const { Cls, code, statusCode } of cases) {
    describe(Cls.name, () => {
      it('captures message and is throwable', () => {
        const err = new Cls('boom')
        expect(err).toBeInstanceOf(DomainError)
        expect(err).toBeInstanceOf(Error)
        expect(err.message).toBe('boom')
        expect(err.name).toBe(Cls.name)
        expect(err.code).toBe(code)
        expect(err.statusCode).toBe(statusCode)
        expect(err.details).toBeUndefined()
      })

      it('preserves optional details', () => {
        const details = { field: 'email' }
        const err = new Cls('bad', details)
        expect(err.details).toEqual(details)
      })

      it('is throwable and catchable as DomainError', () => {
        expect(() => {
          throw new Cls('explode')
        }).toThrow(DomainError)
      })
    })
  }
})
