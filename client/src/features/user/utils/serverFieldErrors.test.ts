import { describe, it, expect } from 'vitest'
import { fieldErrorsFromApiError } from './serverFieldErrors'

function validationError(issues: Array<{ path?: unknown[]; message?: unknown }>) {
  return { response: { data: { error: { code: 'VALIDATION_ERROR', details: { issues } } } } }
}

describe('fieldErrorsFromApiError', () => {
  it('returns {} for non-axios errors without a response payload', () => {
    expect(fieldErrorsFromApiError(new Error('boom'))).toEqual({})
    expect(fieldErrorsFromApiError(undefined)).toEqual({})
  })

  it('returns {} when the error payload is not an object', () => {
    expect(fieldErrorsFromApiError({ response: { data: { error: 'plain string' } } })).toEqual({})
  })

  it('returns {} for non-validation error codes', () => {
    expect(
      fieldErrorsFromApiError({ response: { data: { error: { code: 'CONFLICT' } } } })
    ).toEqual({})
  })

  it('returns {} when a validation error carries no issues', () => {
    expect(
      fieldErrorsFromApiError({ response: { data: { error: { code: 'VALIDATION_ERROR' } } } })
    ).toEqual({})
  })

  it('maps each issue to its first path segment', () => {
    const err = validationError([
      { path: ['email'], message: 'Invalid email' },
      { path: ['password'], message: 'Too short' },
    ])
    expect(fieldErrorsFromApiError(err)).toEqual({ email: 'Invalid email', password: 'Too short' })
  })

  it('skips issues whose path segment or message is not a string', () => {
    const err = validationError([
      { path: [0], message: 'numeric path' },
      { message: 'no path at all' },
      { path: ['email'], message: 42 },
      { path: ['email'], message: 'kept' },
    ])
    expect(fieldErrorsFromApiError(err)).toEqual({ email: 'kept' })
  })

  it('keeps the first message when a field has multiple issues', () => {
    const err = validationError([
      { path: ['password'], message: 'first' },
      { path: ['password'], message: 'second' },
    ])
    expect(fieldErrorsFromApiError(err)).toEqual({ password: 'first' })
  })
})
