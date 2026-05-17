import { Request, Response, NextFunction } from 'express'
import { logger } from '../../shared/infrastructure/logger/index.js'
import { DomainError } from '../../shared/errors/index.js'

const log = logger.child('[http]')

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    if (err.statusCode >= 500) {
      log.error(err.message, { code: err.code, details: err.details, stack: err.stack })
    } else {
      log.warn(err.message, { code: err.code, details: err.details })
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    })
    return
  }

  log.error(err.message, { stack: err.stack })
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  })
}
