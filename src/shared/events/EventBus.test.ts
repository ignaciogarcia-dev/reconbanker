import { describe, expect, it } from 'vitest'
import { EventBus, InMemoryEventBus } from './EventBus.js'

describe('EventBus barrel', () => {
  it('exports a default in-memory singleton', () => {
    expect(EventBus).toBeInstanceOf(InMemoryEventBus)
  })

  it('re-exports InMemoryEventBus', () => {
    expect(InMemoryEventBus).toBeTypeOf('function')
  })
})
