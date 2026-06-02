import { describe, expect, it } from 'vitest'
import { AccountConfigRowMapper, type AccountConfigRow } from './AccountConfigRowMapper.js'
import { AccountRowMapper, type AccountRow } from './AccountRowMapper.js'
import { BankRowMapper, type BankRow } from './BankRowMapper.js'

describe('AccountConfigRowMapper', () => {
  const baseRow: AccountConfigRow = {
    id: 'cfg-1',
    account_id: 'acc-1',
    pending_orders_endpoint: 'https://x.io/orders',
    webhook_url: 'https://x.io/webhook',
    retry_limit: 3,
    polling_method: 'GET',
    polling_body: null,
    auth_type: 'bearer',
    auth_token: 'tok',
    webhook_auth_type: null,
    webhook_auth_token: null,
    notify_on_expired: true,
    webhook_extra_fields: { foo: 'bar' },
    silent_ingestion: true,
    session_type: 'one-shot',
    login_mode: 'simple',
  }

  it('maps a full row into the domain config', () => {
    expect(AccountConfigRowMapper.toDto(baseRow)).toEqual({
      id: 'cfg-1',
      accountId: 'acc-1',
      pendingOrdersEndpoint: 'https://x.io/orders',
      webhookUrl: 'https://x.io/webhook',
      retryLimit: 3,
      pollingMethod: 'GET',
      pollingBody: null,
      authType: 'bearer',
      authToken: 'tok',
      webhookAuthType: null,
      webhookAuthToken: null,
      notifyOnExpired: true,
      webhookExtraFields: { foo: 'bar' },
      silentIngestion: true,
      sessionType: 'one-shot',
      loginMode: 'simple',
    })
  })

  it('defaults silentIngestion to false when the column is null', () => {
    const row = { ...baseRow, silent_ingestion: null }
    expect(AccountConfigRowMapper.toDto(row).silentIngestion).toBe(false)
  })
})

describe('AccountRowMapper', () => {
  const row: AccountRow = {
    id: 'acc-1',
    user_id: 'u-1',
    bank_id: 'b-1',
    bank_code: 'mi-dinero',
    name: 'My Account',
    status: 'active',
    created_at: new Date('2024-01-01T00:00:00Z'),
  }

  it('reconstitutes a full account aggregate', () => {
    const account = AccountRowMapper.toAggregate(row)
    expect(account.id).toBe('acc-1')
    expect(account.userId).toBe('u-1')
    expect(account.name).toBe('My Account')
    expect(account.status).toBe('active')
  })

  it('preserves null name', () => {
    const account = AccountRowMapper.toAggregate({
      ...row,
      name: null,
    })
    expect(account.name).toBeUndefined()
  })
})

describe('BankRowMapper', () => {
  it('reconstitutes a bank with loginUrl', () => {
    const row: BankRow = {
      id: 'b-1',
      code: 'mi-dinero',
      name: 'Mi Dinero',
      login_url: 'https://x.io',
      status: 'ready',
      created_at: new Date('2024-01-01T00:00:00Z'),
    }
    const bank = BankRowMapper.toAggregate(row)
    expect(bank.id).toBe('b-1')
    expect(bank.loginUrl).toBe('https://x.io')
  })

  it('drops null loginUrl when the column is null', () => {
    const row: BankRow = {
      id: 'b-2',
      code: 'other',
      name: 'Other',
      login_url: null,
      status: 'onboarding',
      created_at: new Date('2024-01-01T00:00:00Z'),
    }
    const bank = BankRowMapper.toAggregate(row)
    expect(bank.loginUrl).toBeUndefined()
  })
})
