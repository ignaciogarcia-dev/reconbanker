import { Request, Response, NextFunction } from 'express'
import { logger } from '../../shared/infrastructure/logger/index.js'

const log = logger.child('[http]')

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  log.error(err.message, { stack: err.stack })
  res.status(500).json({ error: err.message })
}
