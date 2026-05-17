import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })

  it('exposes jest-dom matchers', () => {
    const el = document.createElement('div')
    el.textContent = 'hello'
    expect(el).toHaveTextContent('hello')
  })
})
