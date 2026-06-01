import { describe, it, expect, vi } from 'vitest'
import { buildRequireAdmin } from './requireAdmin.middleware.js'
import type { AuthRequest } from './auth.middleware.js'

function makeRes() {
  const res: any = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

describe('buildRequireAdmin', () => {
  it('responds 401 when there is no authenticated user', async () => {
    const mw = buildRequireAdmin({ getRole: vi.fn() })
    const res = makeRes()
    const next = vi.fn()

    await mw({} as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 403 when the user is not an admin', async () => {
    const mw = buildRequireAdmin({ getRole: vi.fn().mockResolvedValue('user') })
    const res = makeRes()
    const next = vi.fn()

    await mw({ userId: 'u-1' } as AuthRequest, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next when the user is an admin', async () => {
    const mw = buildRequireAdmin({ getRole: vi.fn().mockResolvedValue('admin') })
    const res = makeRes()
    const next = vi.fn()

    await mw({ userId: 'u-1' } as AuthRequest, res, next)

    expect(next).toHaveBeenCalledWith()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('forwards errors from the role reader to next', async () => {
    const err = new Error('db down')
    const mw = buildRequireAdmin({ getRole: vi.fn().mockRejectedValue(err) })
    const res = makeRes()
    const next = vi.fn()

    await mw({ userId: 'u-1' } as AuthRequest, res, next)

    expect(next).toHaveBeenCalledWith(err)
  })
})
