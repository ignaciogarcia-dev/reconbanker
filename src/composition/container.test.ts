import { describe, it, expect } from 'vitest'
import { buildContainer } from './container.js'

describe('buildContainer', () => {
  it('wires shared dependencies and accepts overrides', () => {
    const fakeLogger = {
      debug() {}, info() {}, warn() {}, error() {}, child() { return fakeLogger },
    }
    const fakePool = {} as any
    const c = buildContainer({ pool: fakePool, logger: fakeLogger })
    expect(c.pool).toBe(fakePool)
    expect(c.logger).toBe(fakeLogger)
    expect(c.eventBus).toBeDefined()
    expect(c.unitOfWork).toBeDefined()
    expect(typeof c.unitOfWork.run).toBe('function')
    expect(typeof c.eventBus.publish).toBe('function')
  })
})
