import { describe, expect, it } from 'vitest'
import { UserRowMapper, type UserRow } from './UserRowMapper.js'

describe('UserRowMapper', () => {
  const row: UserRow = {
    id: 'u-1',
    email: 'me@x.io',
    name: 'Me',
    password_hash: 'hash',
    operation_mode: 'reconcile',
    status: 'active',
    created_at: new Date('2024-01-01T00:00:00Z'),
  }

  it('reconstitutes a user with full data', () => {
    const user = UserRowMapper.toAggregate(row)
    expect(user.id).toBe('u-1')
    expect(user.email).toBe('me@x.io')
    expect(user.operationMode).toBe('reconcile')
  })

  it('defaults status to active when null', () => {
    const user = UserRowMapper.toAggregate({ ...row, status: null })
    expect(user.status).toBe('active')
  })

  it('falls back to epoch when created_at is null', () => {
    const user = UserRowMapper.toAggregate({ ...row, created_at: null })
    expect(user.createdAt).toEqual(new Date(0))
  })

  it('defaults TOTP fields to disabled/null when the columns are absent', () => {
    const user = UserRowMapper.toAggregate(row)
    expect(user.isTotpEnabled()).toBe(false)
    expect(user.totpSecret).toBeNull()
    expect(user.totpConfirmedAt).toBeNull()
  })

  it('maps present TOTP columns through to the aggregate (secret already decrypted)', () => {
    const confirmedAt = new Date('2024-02-02T00:00:00Z')
    const user = UserRowMapper.toAggregate({
      ...row,
      totp_secret: 'PLAINSECRET',
      totp_enabled: true,
      totp_confirmed_at: confirmedAt,
    })
    expect(user.totpSecret).toBe('PLAINSECRET')
    expect(user.isTotpEnabled()).toBe(true)
    expect(user.totpConfirmedAt).toEqual(confirmedAt)
  })

  it('treats null totp_enabled as false and null totp_secret as null', () => {
    const user = UserRowMapper.toAggregate({
      ...row,
      totp_secret: null,
      totp_enabled: null,
      totp_confirmed_at: null,
    })
    expect(user.isTotpEnabled()).toBe(false)
    expect(user.totpSecret).toBeNull()
  })
})
