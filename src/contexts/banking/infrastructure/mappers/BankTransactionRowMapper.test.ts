import { describe, expect, it } from 'vitest'
import { BankTransactionRowMapper, type BankTransactionRow } from './BankTransactionRowMapper.js'

describe('BankTransactionRowMapper', () => {
  const row: BankTransactionRow = {
    id: 'tx-1',
    account_id: 'acc-1',
    external_id: 'ext-1',
    reference_hash: 'hash',
    amount: '1500.25',
    currency: 'ARS',
    sender_name: 'Sender',
    received_at: new Date('2024-01-01T00:00:00Z'),
    script_id: 's-1',
    ingested_at: new Date('2024-01-01T01:00:00Z'),
    raw_payload: { raw: true },
  }

  it('parses numeric amount from string and preserves fields', () => {
    const tx = BankTransactionRowMapper.toAggregate(row)
    expect(tx.id).toBe('tx-1')
    expect(tx.amount).toBe(1500.25)
    expect(tx.currency).toBe('ARS')
    expect(tx.senderName).toBe('Sender')
  })

  it('accepts numeric amount unchanged', () => {
    const tx = BankTransactionRowMapper.toAggregate({ ...row, amount: 200 })
    expect(tx.amount).toBe(200)
  })

  it('drops null sender_name', () => {
    const tx = BankTransactionRowMapper.toAggregate({ ...row, sender_name: null })
    expect(tx.senderName).toBeUndefined()
  })
})
