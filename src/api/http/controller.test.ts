import { describe, it, expect, vi } from 'vitest'
import { controller } from './controller.js'

describe('controller()', () => {
  it('forwards async errors to next()', async () => {
    const next = vi.fn()
    const wrapped = controller(async () => {
      throw new Error('boom')
    })
    await wrapped({} as any, {} as any, next)
    await new Promise((r) => setImmediate(r))
    expect(next).toHaveBeenCalledTimes(1)
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  it('does not call next() on success', async () => {
    const next = vi.fn()
    const wrapped = controller(async () => {})
    await wrapped({} as any, {} as any, next)
    await new Promise((r) => setImmediate(r))
    expect(next).not.toHaveBeenCalled()
  })
})
