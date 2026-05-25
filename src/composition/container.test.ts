import { describe, it, expect } from 'vitest'
import { buildContainer } from './container.js'

describe('buildContainer', () => {
  const fakeLogger = (() => {
    const l: any = {
      debug() {}, info() {}, warn() {}, error() {},
      child() { return l },
    }
    return l
  })()
  const fakePool = { query: () => Promise.resolve({ rows: [] }) } as any

  it('wires shared dependencies and accepts overrides', () => {
    const c = buildContainer({ pool: fakePool, logger: fakeLogger })
    expect(c.pool).toBe(fakePool)
    expect(c.logger).toBe(fakeLogger)
    expect(c.eventBus).toBeDefined()
    expect(c.unitOfWork).toBeDefined()
    expect(typeof c.unitOfWork.run).toBe('function')
    expect(typeof c.eventBus.publish).toBe('function')
  })

  it('builds every module on the container', () => {
    const c = buildContainer({ pool: fakePool, logger: fakeLogger })
    expect(c.user).toBeDefined()
    expect(c.account).toBeDefined()
    expect(c.banking).toBeDefined()
    expect(c.conciliation).toBeDefined()
    expect(c.scriptEngine).toBeDefined()
  })

  it('uses the default logger and event bus when no override is given', () => {
    const c = buildContainer({ pool: fakePool })
    expect(c.logger).toBeDefined()
    expect(c.eventBus).toBeDefined()
  })

  it('accepts an explicit eventBus override', () => {
    const eventBus = { publish: () => Promise.resolve(), subscribe: () => {} } as any
    const c = buildContainer({ pool: fakePool, logger: fakeLogger, eventBus })
    expect(c.eventBus).toBe(eventBus)
  })
})
