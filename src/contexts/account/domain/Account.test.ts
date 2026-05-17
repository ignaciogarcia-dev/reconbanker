import { describe, it, expect } from 'vitest'
import { Account } from './Account.js'
import { Bank } from './Bank.js'
import { ValidationError } from '../../../shared/errors/index.js'

describe('Account.create', () => {
  it('creates an active account and emits AccountCreated', () => {
    const a = Account.create('id-1', 'user-1', 'bank-1', 'TEST', 'My account')
    expect(a.id).toBe('id-1')
    expect(a.userId).toBe('user-1')
    expect(a.bank).toBe('TEST')
    expect(a.name).toBe('My account')
    expect(a.status).toBe('active')
    expect(a.domainEvents).toHaveLength(1)
    expect(a.domainEvents[0].eventType).toBe('AccountCreated')
  })

  it('trims the name and treats blank as invalid', () => {
    const a = Account.create('id-1', 'user-1', 'bank-1', 'TEST', '  spaced  ')
    expect(a.name).toBe('spaced')
    expect(() => Account.create('id-1', 'user-1', 'bank-1', 'TEST', '   ')).toThrow(ValidationError)
  })

  it.each([
    [{ userId: '', bankId: 'b', bankCode: 'C' }],
    [{ userId: 'u', bankId: '', bankCode: 'C' }],
    [{ userId: 'u', bankId: 'b', bankCode: '' }],
  ])('rejects missing required field %#', ({ userId, bankId, bankCode }) => {
    expect(() => Account.create('id', userId, bankId, bankCode)).toThrow(ValidationError)
  })

  it('belongsTo identifies the owner', () => {
    const a = Account.create('id', 'user-1', 'b', 'C')
    expect(a.belongsTo('user-1')).toBe(true)
    expect(a.belongsTo('other')).toBe(false)
  })
})

describe('Bank.create', () => {
  it('creates a pending bank and trims fields', () => {
    const b = Bank.create('id-1', '  CODE  ', '  My Bank  ', '  https://x  ')
    expect(b.code).toBe('CODE')
    expect(b.name).toBe('My Bank')
    expect(b.loginUrl).toBe('https://x')
    expect(b.status).toBe('pending')
  })

  it('treats empty loginUrl as undefined', () => {
    const b = Bank.create('id-1', 'CODE', 'My Bank', '')
    expect(b.loginUrl).toBeUndefined()
  })

  it.each([
    ['', 'name'],
    ['code', ''],
  ])('rejects missing code/name (%s, %s)', (code, name) => {
    expect(() => Bank.create('id', code, name)).toThrow(ValidationError)
  })
})
