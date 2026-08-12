import { describe, expect, it } from 'vitest'
import { BankScriptRowMapper, type BankScriptRow } from './BankScriptRowMapper.js'

describe('BankScriptRowMapper', () => {
  const row: BankScriptRow = {
    id: 's-1',
    bank: 'mi-dinero',
    flow_type: 'extract_transactions',
    version: '2.0.1',
    status: 'active',
    origin: 'system',
    base_script_id: 'base-1',
    code_snapshot: 'console.log("hi")',
    selector_map: { login: '#login' },
    created_at: new Date('2024-01-01T00:00:00Z'),
    user_id: null,
    account_id: null,
  }

  it('reconstitutes a script with all fields populated', () => {
    const script = BankScriptRowMapper.toAggregate(row)
    expect(script.id).toBe('s-1')
    expect(script.baseScriptId).toBe('base-1')
    expect(script.codeSnapshot).toBe('console.log("hi")')
    expect(script.selectorMap).toEqual({ login: '#login' })
  })

  it('drops nullable base/code fields', () => {
    const script = BankScriptRowMapper.toAggregate({
      ...row,
      base_script_id: null,
      code_snapshot: null,
    })
    expect(script.baseScriptId).toBeUndefined()
    expect(script.codeSnapshot).toBeUndefined()
  })

  it('passes through user_id and account_id when present', () => {
    const script = BankScriptRowMapper.toAggregate({
      ...row,
      user_id: 'user-1',
      account_id: 'acct-1',
    })
    expect(script.userId).toBe('user-1')
    expect(script.accountId).toBe('acct-1')
  })

  it('drops user_id/account_id to undefined when null', () => {
    const script = BankScriptRowMapper.toAggregate(row)
    expect(script.userId).toBeUndefined()
    expect(script.accountId).toBeUndefined()
  })
})
