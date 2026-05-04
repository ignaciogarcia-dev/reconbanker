import winston from 'winston'
import { buildTransports } from './transports.js'

const rootLogger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  transports: buildTransports(),
})

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
  child(context: string): Logger
}

function wrap(inner: winston.Logger, context?: string): Logger {
  const base = context ? { context } : {}
  return {
    debug: (msg, meta) => inner.debug(msg, { ...base, ...meta }),
    info:  (msg, meta) => inner.info(msg,  { ...base, ...meta }),
    warn:  (msg, meta) => inner.warn(msg,  { ...base, ...meta }),
    error: (msg, meta) => inner.error(msg, { ...base, ...meta }),
    child: (ctx) => wrap(inner, ctx),
  }
}

export const logger: Logger = wrap(rootLogger)
