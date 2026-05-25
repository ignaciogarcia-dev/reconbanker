import { describe, it, expect, vi, beforeEach } from 'vitest'

const log = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

const childLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: log.warn,
  error: log.error,
  child: vi.fn(),
}

vi.mock('../../shared/infrastructure/logger/index.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => childLogger),
  },
}))

const { errorMiddleware } = await import('./error.middleware.js')
const {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} = await import('../../shared/errors/index.js')

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res
}

class TestServerError extends DomainError {
  readonly code = 'SERVER_FAIL'
  readonly statusCode = 503
}

describe('errorMiddleware', () => {
  beforeEach(() => {
    log.warn.mockReset()
    log.error.mockReset()
  })

  it('maps NotFoundError to 404 and logs via warn (no details key)', () => {
    const res = makeRes()
    const err = new NotFoundError('missing')
    errorMiddleware(err, {} as never, res as never, () => {})

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'missing' },
    })
    expect(log.warn).toHaveBeenCalledWith('missing', {
      code: 'NOT_FOUND',
      details: undefined,
    })
    expect(log.error).not.toHaveBeenCalled()
  })

  it('maps ValidationError to 400 with details on body and log', () => {
    const res = makeRes()
    const err = new ValidationError('bad', { field: 'x' })
    errorMiddleware(err, {} as never, res as never, () => {})

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'VALIDATION_ERROR', message: 'bad', details: { field: 'x' } },
    })
    expect(log.warn).toHaveBeenCalledWith('bad', {
      code: 'VALIDATION_ERROR',
      details: { field: 'x' },
    })
  })

  it.each([
    [new ConflictError('dup'), 409, 'CONFLICT'] as const,
    [new UnauthorizedError('nope'), 401, 'UNAUTHORIZED'] as const,
    [new ForbiddenError('forbid'), 403, 'FORBIDDEN'] as const,
  ])('maps 4xx domain error %#', (err, status, code) => {
    const res = makeRes()
    errorMiddleware(err, {} as never, res as never, () => {})

    expect(res.status).toHaveBeenCalledWith(status)
    expect(res.json).toHaveBeenCalledWith({
      error: { code, message: err.message },
    })
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.error).not.toHaveBeenCalled()
  })

  it('logs via error for 5xx DomainError subclasses and keeps the response shape', () => {
    const res = makeRes()
    const err = new TestServerError('upstream down', { service: 'redis' })
    errorMiddleware(err, {} as never, res as never, () => {})

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'SERVER_FAIL',
        message: 'upstream down',
        details: { service: 'redis' },
      },
    })
    expect(log.error).toHaveBeenCalledWith('upstream down', {
      code: 'SERVER_FAIL',
      details: { service: 'redis' },
      stack: err.stack,
    })
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('falls back to 500 for unknown errors and logs via error', () => {
    const res = makeRes()
    const err = new Error('boom')
    errorMiddleware(err, {} as never, res as never, () => {})

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    })
    expect(log.error).toHaveBeenCalledWith('boom', { stack: err.stack })
    expect(log.warn).not.toHaveBeenCalled()
  })
})
