import { describe, it, expect, vi } from 'vitest'
import { PgUnitOfWork } from './PgUnitOfWork.js'

function makePool() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  }
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  }
  return { pool, client }
}

describe('PgUnitOfWork', () => {
  it('commits on success and releases client', async () => {
    const { pool, client } = makePool()
    const uow = new PgUnitOfWork(pool as any)
    const result = await uow.run(async (tx) => {
      await tx.query('SELECT 1')
      return 'ok'
    })
    expect(result).toBe('ok')
    const calls = client.query.mock.calls.map((c) => c[0])
    expect(calls).toEqual(['BEGIN', 'SELECT 1', 'COMMIT'])
    expect(client.release).toHaveBeenCalled()
  })

  it('rolls back and rethrows on failure, releases client', async () => {
    const { pool, client } = makePool()
    const uow = new PgUnitOfWork(pool as any)
    await expect(
      uow.run(async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    const calls = client.query.mock.calls.map((c) => c[0])
    expect(calls).toEqual(['BEGIN', 'ROLLBACK'])
    expect(client.release).toHaveBeenCalled()
  })
})
