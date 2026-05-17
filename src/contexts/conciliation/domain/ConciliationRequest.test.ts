import { describe, it, expect } from 'vitest'
import { ConciliationRequest } from './ConciliationRequest.js'
import { ValidationError, ConflictError } from '../../../shared/errors/index.js'

const baseProps = {
  accountId: 'acc-1',
  externalId: 'ext-1',
  expectedAmount: 100,
  currency: 'USD',
  senderName: 'Alice',
}

describe('ConciliationRequest.create', () => {
  it('creates a pending request with defaults', () => {
    const req = ConciliationRequest.create('id-1', baseProps)
    expect(req.id).toBe('id-1')
    expect(req.status).toBe('pending')
    expect(req.retryCount).toBe(0)
    expect(req.createdAt).toBeInstanceOf(Date)
  })

  it.each([
    [{ ...baseProps, accountId: '' }, 'accountId'],
    [{ ...baseProps, externalId: '' }, 'externalId'],
    [{ ...baseProps, expectedAmount: 0 }, 'expectedAmount'],
    [{ ...baseProps, expectedAmount: -1 }, 'expectedAmount'],
    [{ ...baseProps, expectedAmount: NaN }, 'expectedAmount'],
    [{ ...baseProps, currency: 'X' }, 'currency'],
    [{ ...baseProps, currency: '' }, 'currency'],
  ])('rejects invalid props %#', (props, _field) => {
    expect(() => ConciliationRequest.create('id', props as any)).toThrow(ValidationError)
  })
})

describe('ConciliationRequest state transitions', () => {
  it('markMatched emits a domain event', () => {
    const req = ConciliationRequest.create('id-1', baseProps)
    req.markMatched('tx-1')
    expect(req.status).toBe('matched')
    expect(req.domainEvents).toHaveLength(1)
    expect(req.domainEvents[0].eventType).toBe('ConciliationMatched')
  })

  it('markNotFound increments retryCount and emits failed event', () => {
    const req = ConciliationRequest.create('id-1', baseProps)
    req.markNotFound()
    expect(req.status).toBe('not_found')
    expect(req.retryCount).toBe(1)
    expect(req.domainEvents[0].eventType).toBe('ConciliationFailed')
  })

  it('rejects transitions from terminal status (matched)', () => {
    const req = ConciliationRequest.create('id-1', baseProps)
    req.markMatched('tx-1')
    expect(() => req.markNotFound()).toThrow(ConflictError)
    expect(() => req.markProcessing()).toThrow(ConflictError)
  })

  it('markExpired/markCancelled are no-ops on terminal requests', () => {
    const req = ConciliationRequest.create('id-1', baseProps)
    req.markMatched('tx-1')
    req.clearDomainEvents()
    req.markExpired()
    req.markCancelled()
    expect(req.status).toBe('matched')
    expect(req.domainEvents).toHaveLength(0)
  })

  it('markMatched without bankTransactionId throws', () => {
    const req = ConciliationRequest.create('id-1', baseProps)
    expect(() => req.markMatched('')).toThrow(ValidationError)
  })
})
