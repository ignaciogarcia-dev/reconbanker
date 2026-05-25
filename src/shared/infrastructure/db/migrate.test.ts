import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const dbMock = {
  query: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
}

vi.mock('./client.js', () => ({ db: dbMock }))

const fsMock = {
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}
vi.mock('fs', () => ({ default: fsMock, ...fsMock }))

const logger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  child: () => logger,
}
vi.mock('../logger/index.js', () => ({ logger }))

describe('migrate.ts', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    dbMock.query.mockReset()
    dbMock.end.mockReset().mockResolvedValue(undefined)
    fsMock.readdirSync.mockReset()
    fsMock.readFileSync.mockReset()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      // Noop so the IIFE's .catch handler doesn't trigger an unhandled rejection.
      return undefined as never
    }) as never)
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  it('applies pending SQL migrations and skips already-applied ones', async () => {
    fsMock.readdirSync.mockReturnValue(['002_b.sql', '001_a.sql', 'README.md'])
    fsMock.readFileSync.mockImplementation((p: string) => `-- sql for ${p}`)
    dbMock.query.mockImplementation(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('CREATE TABLE IF NOT EXISTS _migrations')) return { rows: [] }
      if (sql.startsWith('SELECT 1 FROM _migrations')) {
        const filename = (_params as string[])[0]
        if (filename === '001_a.sql') return { rows: [{ '?column?': 1 }] }
        return { rows: [] }
      }
      return { rows: [] }
    })

    await import('./migrate.js')
    // Wait a few microtasks for the top-level await chain to settle.
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))

    expect(dbMock.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS _migrations'))
    expect(dbMock.end).toHaveBeenCalled()
    const infoMessages = logger.info.mock.calls.map((c) => c[0] as string)
    expect(infoMessages).toContain('skip  001_a.sql')
    expect(infoMessages).toContain('apply 002_b.sql')
    expect(infoMessages).toContain('done')
  })

  it('logs and exits(1) when migration fails', async () => {
    fsMock.readdirSync.mockImplementation(() => { throw new Error('disk-down') })
    dbMock.query.mockResolvedValue({ rows: [] })

    await import('./migrate.js')
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))

    expect(logger.error).toHaveBeenCalledWith('migration failed', expect.objectContaining({ error: 'disk-down' }))
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('coerces non-Error rejections in the failure log', async () => {
    dbMock.query.mockRejectedValueOnce('rawfail')

    await import('./migrate.js')
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))

    expect(logger.error).toHaveBeenCalledWith('migration failed', expect.objectContaining({ error: 'rawfail' }))
  })
})
