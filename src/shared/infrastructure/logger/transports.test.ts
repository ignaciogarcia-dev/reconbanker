import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('buildTransports', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  })

  it('includes a console transport when NODE_ENV is not production', async () => {
    process.env.NODE_ENV = 'development'
    const { buildTransports } = await import('./transports.js')
    const transports = buildTransports()
    expect(transports.length).toBe(3)
  })

  it('omits the console transport when NODE_ENV is production', async () => {
    process.env.NODE_ENV = 'production'
    const { buildTransports } = await import('./transports.js')
    const transports = buildTransports()
    expect(transports.length).toBe(2)
  })

  it('console transport printf renders meta with and without context', async () => {
    process.env.NODE_ENV = 'development'
    const winston = (await import('winston')).default
    const { buildTransports } = await import('./transports.js')
    const transports = buildTransports()
    const consoleTransport = transports.find((t) => t instanceof winston.transports.Console)!
    expect(consoleTransport).toBeDefined()

    // Build a logger to exercise the printf format branches: with context+meta, then bare.
    const logger = winston.createLogger({ level: 'debug', transports: [consoleTransport] })
    expect(() => logger.info('hello', { context: '[ctx]', extra: 1 })).not.toThrow()
    expect(() => logger.info('hello-bare')).not.toThrow()
  })
})
