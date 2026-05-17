import { describe, it, expect } from 'vitest'
import { User } from './User.js'
import { ValidationError } from '../../../shared/errors/index.js'

describe('User.create', () => {
  it('creates a user with normalized email and trimmed name', () => {
    const u = User.create('id-1', '  ALICE@example.COM  ', 'hash', '  Alice  ')
    expect(u.email).toBe('alice@example.com')
    expect(u.name).toBe('Alice')
    expect(u.status).toBe('active')
    expect(u.operationMode).toBeNull()
  })

  it('treats blank/missing name as null', () => {
    expect(User.create('id', 'a@b.com', 'h').name).toBeNull()
    expect(User.create('id', 'a@b.com', 'h', '   ').name).toBeNull()
  })

  it.each(['', 'not-an-email', 'a@b', '@b.com'])('rejects invalid email %s', (email) => {
    expect(() => User.create('id', email, 'h')).toThrow(ValidationError)
  })

  it('requires a passwordHash', () => {
    expect(() => User.create('id', 'a@b.com', '')).toThrow(ValidationError)
  })
})

describe('User.changeOperationMode', () => {
  it('updates the mode and emits an event', () => {
    const u = User.create('id', 'a@b.com', 'h')
    u.changeOperationMode('reconcile')
    expect(u.operationMode).toBe('reconcile')
    expect(u.domainEvents).toHaveLength(1)
    expect(u.domainEvents[0].eventType).toBe('OperationModeChanged')
  })

  it('is a no-op when mode does not change', () => {
    const u = User.create('id', 'a@b.com', 'h')
    u.changeOperationMode('passthrough')
    u.clearDomainEvents()
    u.changeOperationMode('passthrough')
    expect(u.domainEvents).toHaveLength(0)
  })

  it('rejects invalid modes', () => {
    const u = User.create('id', 'a@b.com', 'h')
    expect(() => u.changeOperationMode('whatever' as never)).toThrow(ValidationError)
  })
})
