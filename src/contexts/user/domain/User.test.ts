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

describe('User getters and reconstitute', () => {
  it('reconstitute carries through all props', () => {
    const u = User.reconstitute('id', {
      email: 'b@c.com', name: 'N', passwordHash: 'h',
      operationMode: 'reconcile', status: 'inactive', createdAt: new Date('2023-01-01T00:00:00Z'),
    })
    expect(u.email).toBe('b@c.com')
    expect(u.name).toBe('N')
    expect(u.passwordHash).toBe('h')
    expect(u.operationMode).toBe('reconcile')
    expect(u.status).toBe('inactive')
    expect(u.isActive()).toBe(false)
    expect(u.createdAt).toBeInstanceOf(Date)
  })

  it('defaults TOTP fields to disabled when omitted', () => {
    const u = User.create('id', 'a@b.com', 'h')
    expect(u.isTotpEnabled()).toBe(false)
    expect(u.totpSecret).toBeNull()
    expect(u.totpConfirmedAt).toBeNull()
  })
})

describe('User TOTP lifecycle', () => {
  it('beginTotpEnrollment stores the secret without enabling 2FA', () => {
    const u = User.create('id', 'a@b.com', 'h')
    u.beginTotpEnrollment('JBSWY3DPEHPK3PXP')
    expect(u.totpSecret).toBe('JBSWY3DPEHPK3PXP')
    expect(u.isTotpEnabled()).toBe(false)
  })

  it('rejects an empty secret', () => {
    const u = User.create('id', 'a@b.com', 'h')
    expect(() => u.beginTotpEnrollment('  ')).toThrow(ValidationError)
  })

  it('confirmTotp enables 2FA and stamps the confirmation', () => {
    const u = User.create('id', 'a@b.com', 'h')
    u.beginTotpEnrollment('JBSWY3DPEHPK3PXP')
    u.confirmTotp()
    expect(u.isTotpEnabled()).toBe(true)
    expect(u.totpConfirmedAt).toBeInstanceOf(Date)
  })

  it('confirmTotp fails when there is no pending secret', () => {
    const u = User.create('id', 'a@b.com', 'h')
    expect(() => u.confirmTotp()).toThrow(ValidationError)
  })

  it('disableTotp clears the secret and disables 2FA', () => {
    const u = User.create('id', 'a@b.com', 'h')
    u.beginTotpEnrollment('JBSWY3DPEHPK3PXP')
    u.confirmTotp()
    u.disableTotp()
    expect(u.isTotpEnabled()).toBe(false)
    expect(u.totpSecret).toBeNull()
    expect(u.totpConfirmedAt).toBeNull()
  })

  it('re-enrolling after confirm replaces the secret and drops back to disabled', () => {
    const u = User.create('id', 'a@b.com', 'h')
    u.beginTotpEnrollment('SECRET1')
    u.confirmTotp()
    u.beginTotpEnrollment('SECRET2')
    expect(u.totpSecret).toBe('SECRET2')
    expect(u.isTotpEnabled()).toBe(false)
    expect(u.totpConfirmedAt).toBeNull()
  })

  it('disableTotp is a safe no-op when 2FA was never enabled', () => {
    const u = User.create('id', 'a@b.com', 'h')
    expect(() => u.disableTotp()).not.toThrow()
    expect(u.isTotpEnabled()).toBe(false)
    expect(u.totpSecret).toBeNull()
  })

  it('confirmTotp twice keeps 2FA enabled (idempotent re-confirm)', () => {
    const u = User.create('id', 'a@b.com', 'h')
    u.beginTotpEnrollment('SECRET')
    u.confirmTotp()
    expect(() => u.confirmTotp()).not.toThrow()
    expect(u.isTotpEnabled()).toBe(true)
  })
})
