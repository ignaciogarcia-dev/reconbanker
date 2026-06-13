import { describe, expect, it } from 'vitest'
import { firstFailingPasswordRule } from './passwordRules'

describe('firstFailingPasswordRule', () => {
  it('returns minLength for short passwords', () => {
    expect(firstFailingPasswordRule('Short1')).toBe('minLength')
  })

  it('returns maxLength for passwords over 32 characters', () => {
    expect(firstFailingPasswordRule('A1' + 'a'.repeat(32))).toBe('maxLength')
  })

  it('returns lowercase when no lowercase letter present', () => {
    expect(firstFailingPasswordRule('UPPERCASE12345')).toBe('lowercase')
  })

  it('returns uppercase when no uppercase letter present', () => {
    expect(firstFailingPasswordRule('lowercase12345')).toBe('uppercase')
  })

  it('returns number when no digit present', () => {
    expect(firstFailingPasswordRule('NoNumbersHereAtAll')).toBe('number')
  })

  it('reports one rule at a time in order', () => {
    expect(firstFailingPasswordRule('abc')).toBe('minLength')
    expect(firstFailingPasswordRule('abcdefghijkl')).toBe('uppercase')
    expect(firstFailingPasswordRule('Abcdefghijkl')).toBe('number')
  })

  it('returns null for a valid password', () => {
    expect(firstFailingPasswordRule('ValidPassword1')).toBeNull()
  })
})
