import { describe, it, expect } from 'vitest'
import { BankTransaction } from './BankTransaction.js'

const baseProps = {
  accountId: 'acc-1',
  externalId: 'ext-1',
  referenceHash: 'hash-1',
  amount: 100,
  currency: 'USD',
  senderName: 'Alice',
  receivedAt: new Date('2024-01-01T00:00:00Z'),
  scriptId: 'script-1',
  rawPayload: { raw: 'x' },
}

describe('BankTransaction.create', () => {
  it('creates a transaction with ingestedAt set and emits TransactionIngested', () => {
    const tx = BankTransaction.create('id-1', baseProps)
    expect(tx.id).toBe('id-1')
    expect(tx.accountId).toBe('acc-1')
    expect(tx.externalId).toBe('ext-1')
    expect(tx.referenceHash).toBe('hash-1')
    expect(tx.amount).toBe(100)
    expect(tx.currency).toBe('USD')
    expect(tx.senderName).toBe('Alice')
    expect(tx.receivedAt).toBe(baseProps.receivedAt)
    expect(tx.scriptId).toBe('script-1')
    expect(tx.ingestedAt).toBeInstanceOf(Date)
    expect(tx.rawPayload).toEqual({ raw: 'x' })
    expect(tx.domainEvents).toHaveLength(1)
    expect(tx.domainEvents[0].eventType).toBe('TransactionIngested')
  })

  it('reconstitute carries through ingestedAt without emitting events', () => {
    const ingestedAt = new Date('2024-02-02T00:00:00Z')
    const tx = BankTransaction.reconstitute('id-1', { ...baseProps, ingestedAt })
    expect(tx.ingestedAt).toBe(ingestedAt)
    expect(tx.domainEvents).toHaveLength(0)
  })

  it('allows missing senderName', () => {
    const tx = BankTransaction.create('id-1', { ...baseProps, senderName: undefined })
    expect(tx.senderName).toBeUndefined()
  })
})
