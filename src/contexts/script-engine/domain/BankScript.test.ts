import { describe, it, expect } from 'vitest'
import { BankScript } from './BankScript.js'
import { ValidationError, ConflictError } from '../../../shared/errors/index.js'

const base = {
  bank: 'TEST',
  flowType: 'extract_transactions' as const,
  version: '1.0.0',
  status: 'review' as const,
  origin: 'system' as const,
  selectorMap: {},
}

describe('BankScript.create', () => {
  it('creates a script with valid props', () => {
    const s = BankScript.create('id-1', base)
    expect(s.bank).toBe('TEST')
    expect(s.status).toBe('review')
  })

  it.each(['1', '1.0', '1.0.0.0', 'v1.0.0', ''])('rejects bad version %s', (v) => {
    expect(() => BankScript.create('id', { ...base, version: v })).toThrow(ValidationError)
  })

  it('rejects missing bank/flowType', () => {
    expect(() => BankScript.create('id', { ...base, bank: '' })).toThrow(ValidationError)
  })
})

describe('BankScript.promote', () => {
  it('promotes review → active and emits event', () => {
    const s = BankScript.create('id-1', base)
    s.promote()
    expect(s.status).toBe('active')
    expect(s.domainEvents).toHaveLength(1)
    expect(s.domainEvents[0].eventType).toBe('ScriptPromoted')
  })

  it.each(['draft', 'testing', 'active', 'deprecated', 'failed'])(
    'rejects promote from %s', (status) => {
      const s = BankScript.create('id-1', { ...base, status: status as 'draft' })
      expect(() => s.promote()).toThrow(ConflictError)
    }
  )
})

describe('BankScript.deprecate', () => {
  it('moves to deprecated and is idempotent', () => {
    const s = BankScript.create('id-1', { ...base, status: 'active' })
    s.deprecate()
    expect(s.status).toBe('deprecated')
    s.deprecate()
    expect(s.status).toBe('deprecated')
  })
})
