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
})
