import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validateBody, validateParams, validateQuery } from './validate.js'
import { ValidationError } from '../../shared/errors/index.js'

const schema = z.object({ name: z.string().min(1) })

describe('validate helpers', () => {
  it('returns parsed body on success', () => {
    const req = { body: { name: 'ok' } } as any
    expect(validateBody(req, schema)).toEqual({ name: 'ok' })
  })

  it('throws ValidationError with issues on failure', () => {
    const req = { body: { name: '' } } as any
    try {
      validateBody(req, schema)
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      expect((e as ValidationError).details?.source).toBe('body')
      expect(Array.isArray((e as ValidationError).details?.issues)).toBe(true)
      const issue = ((e as ValidationError).details?.issues as object[])[0]
      // Sanitized issues expose only safe fields so schema internals never leak
      expect(Object.keys(issue).sort()).toEqual(['code', 'message', 'path'])
    }
  })

  it('validates params and query the same way', () => {
    expect(validateParams({ params: { name: 'p' } } as any, schema)).toEqual({ name: 'p' })
    expect(validateQuery({ query: { name: 'q' } } as any, schema)).toEqual({ name: 'q' })
  })
})
