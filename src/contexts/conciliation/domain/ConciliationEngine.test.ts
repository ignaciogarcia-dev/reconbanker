import { describe, it, expect } from 'vitest'
import { ConciliationEngine, type CandidateTransaction, type RequestData } from './ConciliationEngine.js'

const baseRequest: RequestData = {
  expectedAmount: 100,
  currency: 'USD',
  senderName: 'Alice Lopez',
  createdAt: new Date('2024-01-10T00:00:00Z'),
}

function tx(over: Partial<CandidateTransaction>): CandidateTransaction {
  return {
    id: over.id ?? 'tx',
    amount: over.amount ?? 100,
    currency: over.currency ?? 'USD',
    senderName: over.senderName,
    receivedAt: over.receivedAt ?? new Date('2024-01-09T00:00:00Z'),
  }
}

describe('ConciliationEngine.evaluate', () => {
  const engine = new ConciliationEngine()

  it('returns notFound when no candidate matches the amount/currency', () => {
    const result = engine.evaluate(baseRequest, [tx({ id: 'a', amount: 50 })])
    expect(result.status).toBe('not_found')
  })

  it('returns notFound when filtered candidates have zero sender overlap', () => {
    const result = engine.evaluate(baseRequest, [
      tx({ id: 'a', senderName: 'Completely Unrelated Counterparty' }),
    ])
    expect(result.status).toBe('not_found')
  })

  it('returns matched on a clean unique exact-name hit', () => {
    const result = engine.evaluate(baseRequest, [
      tx({ id: 'a', senderName: 'Alice Lopez' }),
      tx({ id: 'b', amount: 50, senderName: 'Alice Lopez' }), // filtered by amount
    ])
    expect(result.status).toBe('matched')
    expect(result.transactionId).toBe('a')
  })

  it('returns ambiguous when multiple candidates share sender tokens', () => {
    const result = engine.evaluate(baseRequest, [
      tx({ id: 'a', senderName: 'Alice Lopez' }),
      tx({ id: 'b', senderName: 'Alice L' }),
    ])
    expect(result.status).toBe('ambiguous')
    expect(result.candidateIds).toContain('a')
    expect(result.candidateIds).toContain('b')
  })

  it('filters by the date window before scoring', () => {
    const tooOld = new Date('2023-12-01T00:00:00Z')
    const result = engine.evaluate(baseRequest, [
      tx({ id: 'old', senderName: 'Alice Lopez', receivedAt: tooOld }),
    ])
    expect(result.status).toBe('not_found')
  })
})
