import { describe, expect, it } from 'vitest'
import { AccountCreatedEvent } from './AccountCreated.event.js'
import { ConciliationCancelledEvent } from './ConciliationCancelled.event.js'
import { ConciliationExpiredEvent } from './ConciliationExpired.event.js'
import { ConciliationFailedEvent } from './ConciliationFailed.event.js'
import { ConciliationMatchedEvent } from './ConciliationMatched.event.js'
import { OperationModeChangedEvent } from './OperationModeChanged.event.js'
import { ScrapeRunFailedEvent } from './ScrapeRunFailed.event.js'
import { ScriptPromotedEvent } from './ScriptPromoted.event.js'
import { TransactionIngestedEvent } from './TransactionIngested.event.js'

describe('domain events', () => {
  it('AccountCreatedEvent captures fields', () => {
    const e = new AccountCreatedEvent('acc-1', 'mi-dinero', 'My Account')
    expect(e.eventType).toBe('AccountCreated')
    expect(e.aggregateId).toBe('acc-1')
    expect(e.bank).toBe('mi-dinero')
    expect(e.name).toBe('My Account')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('AccountCreatedEvent allows undefined name', () => {
    const e = new AccountCreatedEvent('acc-1', 'mi-dinero', undefined)
    expect(e.name).toBeUndefined()
  })

  it('ConciliationCancelledEvent captures fields', () => {
    const e = new ConciliationCancelledEvent('req-1', 'acc-1')
    expect(e.eventType).toBe('ConciliationCancelled')
    expect(e.aggregateId).toBe('req-1')
    expect(e.accountId).toBe('acc-1')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('ConciliationExpiredEvent captures fields', () => {
    const e = new ConciliationExpiredEvent('req-1', 'acc-1')
    expect(e.eventType).toBe('ConciliationExpired')
    expect(e.aggregateId).toBe('req-1')
    expect(e.accountId).toBe('acc-1')
  })

  it('ConciliationFailedEvent captures failureType', () => {
    const e = new ConciliationFailedEvent('req-1', 'acc-1', 'not_found')
    expect(e.eventType).toBe('ConciliationFailed')
    expect(e.failureType).toBe('not_found')
  })

  it('ConciliationMatchedEvent captures bankTransactionId', () => {
    const e = new ConciliationMatchedEvent('req-1', 'acc-1', 'tx-1')
    expect(e.eventType).toBe('ConciliationMatched')
    expect(e.bankTransactionId).toBe('tx-1')
  })

  it('OperationModeChangedEvent captures mode', () => {
    const e = new OperationModeChangedEvent('user-1', 'passthrough')
    expect(e.eventType).toBe('OperationModeChanged')
    expect(e.mode).toBe('passthrough')
  })

  it('ScrapeRunFailedEvent captures all fields', () => {
    const e = new ScrapeRunFailedEvent('run-1', 'acc-1', 'script-1', 'auth_failed', 'bad creds')
    expect(e.eventType).toBe('ScrapeRunFailed')
    expect(e.scriptId).toBe('script-1')
    expect(e.failureType).toBe('auth_failed')
    expect(e.errorMessage).toBe('bad creds')
  })

  it('ScriptPromotedEvent captures version metadata', () => {
    const e = new ScriptPromotedEvent('script-1', 'mi-dinero', 'extract_transactions', '2.0.1')
    expect(e.eventType).toBe('ScriptPromoted')
    expect(e.bank).toBe('mi-dinero')
    expect(e.flowType).toBe('extract_transactions')
    expect(e.version).toBe('2.0.1')
  })

  it('TransactionIngestedEvent captures amount/currency/receivedAt', () => {
    const receivedAt = new Date('2024-01-15T10:00:00Z')
    const e = new TransactionIngestedEvent('tx-1', 'acc-1', 1500, 'ARS', receivedAt)
    expect(e.eventType).toBe('TransactionIngested')
    expect(e.amount).toBe(1500)
    expect(e.currency).toBe('ARS')
    expect(e.receivedAt).toBe(receivedAt)
  })
})
