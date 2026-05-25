import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface ClientLike {
  query: (sql: string) => Promise<{ rows: unknown[] }>
  release: () => void
}

describe('db client', () => {
  const original = process.env.DATABASE_URL

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = original
  })

  it('exports a Pool built from DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/test'
    const mod = await import('./client.js')
    expect(mod.db).toBeDefined()
    expect(typeof (mod.db as unknown as { query: unknown }).query).toBe('function')
    expect(typeof mod.withTransaction).toBe('function')
  })

  it('throws when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    await expect(import('./client.js')).rejects.toThrow('DATABASE_URL is required')
  })

  it('withTransaction commits on success and releases the client', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/test'
    const mod = await import('./client.js')
    const queries: string[] = []
    const release = vi.fn()
    const client: ClientLike = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql)
        return { rows: [] }
      }),
      release,
    }
    vi.spyOn(mod.db, 'connect').mockResolvedValue(client as never)

    const result = await mod.withTransaction(async (c) => {
      await c.query('SELECT 1')
      return 42
    })
    expect(result).toBe(42)
    expect(queries[0]).toBe('BEGIN')
    expect(queries).toContain('COMMIT')
    expect(release).toHaveBeenCalled()
  })

  it('withTransaction rolls back and releases on thrown error', async () => {
    process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/test'
    const mod = await import('./client.js')
    const queries: string[] = []
    const release = vi.fn()
    const client: ClientLike = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql)
        return { rows: [] }
      }),
      release,
    }
    vi.spyOn(mod.db, 'connect').mockResolvedValue(client as never)

    await expect(
      mod.withTransaction(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(queries).toContain('BEGIN')
    expect(queries).toContain('ROLLBACK')
    expect(release).toHaveBeenCalled()
  })
})
