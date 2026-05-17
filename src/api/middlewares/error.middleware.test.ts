import { describe, it, expect, vi } from 'vitest'
import { errorMiddleware } from './error.middleware.js'
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from '../../shared/errors/index.js'

function makeRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('errorMiddleware', () => {
  it('maps NotFoundError to 404', () => {
    const res = makeRes()
    errorMiddleware(new NotFoundError('missing'), {} as any, res, () => {})
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'missing' },
    })
  })

  it('maps ValidationError to 400 with details', () => {
    const res = makeRes()
    errorMiddleware(new ValidationError('bad', { field: 'x' }), {} as any, res, () => {})
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'VALIDATION_ERROR', message: 'bad', details: { field: 'x' } },
    })
  })

  it.each([
    [new ConflictError('dup'), 409, 'CONFLICT'],
    [new UnauthorizedError('nope'), 401, 'UNAUTHORIZED'],
    [new ForbiddenError('forbid'), 403, 'FORBIDDEN'],
  ])('maps domain error %#', (err, status, code) => {
    const res = makeRes()
    errorMiddleware(err, {} as any, res, () => {})
    expect(res.status).toHaveBeenCalledWith(status)
    expect(res.json).toHaveBeenCalledWith({
      error: { code, message: err.message },
    })
  })

  it('falls back to 500 for unknown errors and hides internals', () => {
    const res = makeRes()
    errorMiddleware(new Error('boom'), {} as any, res, () => {})
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })
  })
})
