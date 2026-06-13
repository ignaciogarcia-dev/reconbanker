import { describe, it, expect } from 'vitest'
import { isUniqueViolation } from './pgErrors.js'

function pgError(code: string, constraint?: string) {
  return Object.assign(new Error('db error'), { code, constraint })
}

describe('isUniqueViolation', () => {
  it('is false for non-object and null inputs', () => {
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('23505')).toBe(false)
    expect(isUniqueViolation(23505)).toBe(false)
  })

  it('is false when the error code is not 23505', () => {
    expect(isUniqueViolation(pgError('23503'))).toBe(false)
    expect(isUniqueViolation(new Error('plain'))).toBe(false)
  })

  it('is true for a 23505 error when no constraint is required', () => {
    expect(isUniqueViolation(pgError('23505'))).toBe(true)
    expect(isUniqueViolation(pgError('23505', 'any_index'))).toBe(true)
  })

  it('matches the constraint name when one is required', () => {
    expect(isUniqueViolation(pgError('23505', 'uq_x'), 'uq_x')).toBe(true)
    expect(isUniqueViolation(pgError('23505', 'uq_y'), 'uq_x')).toBe(false)
    expect(isUniqueViolation(pgError('23505'), 'uq_x')).toBe(false)
  })
})
