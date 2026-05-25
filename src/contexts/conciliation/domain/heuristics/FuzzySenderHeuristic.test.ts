import { describe, it, expect } from 'vitest'
import { applyFuzzySenderHeuristic } from './FuzzySenderHeuristic.js'
import type { CandidateTransaction, RequestData } from '../ConciliationEngine.js'

const baseRequest: RequestData = {
  expectedAmount: 100,
  currency: 'USD',
  senderName: 'Alice Lopez',
  createdAt: new Date(),
}

function tx(id: string, senderName?: string): CandidateTransaction {
  return { id, amount: 100, currency: 'USD', senderName, receivedAt: new Date() }
}

describe('applyFuzzySenderHeuristic', () => {
  it('returns 1.0 for a normalized exact-name match', () => {
    const scores = applyFuzzySenderHeuristic(baseRequest, [tx('a', 'ALICE  Lopez!')])
    expect(scores.get('a')).toBe(1.0)
  })

  it('returns 0.5 when request senderName is missing', () => {
    const req = { ...baseRequest, senderName: undefined }
    const scores = applyFuzzySenderHeuristic(req, [tx('a', 'Alice')])
    expect(scores.get('a')).toBe(0.5)
  })

  it('returns 0.5 when candidate senderName is missing', () => {
    const scores = applyFuzzySenderHeuristic(baseRequest, [tx('a', undefined)])
    expect(scores.get('a')).toBe(0.5)
  })

  it('returns 0.8 when one name is a substring of the other (no exact match)', () => {
    const scores = applyFuzzySenderHeuristic(baseRequest, [tx('a', 'Alice Lopez Garcia')])
    expect(scores.get('a')).toBe(0.8)
  })

  it('uses Jaccard score for partial token overlap', () => {
    const scores = applyFuzzySenderHeuristic(
      { ...baseRequest, senderName: 'Alice Bob' },
      [tx('a', 'Bob Charlie')]
    )
    const s = scores.get('a')!
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })

  it('returns 0 when tokens do not overlap', () => {
    const scores = applyFuzzySenderHeuristic(baseRequest, [tx('a', 'Bob Charlie')])
    expect(scores.get('a')).toBe(0)
  })

  it('normalizes accents and punctuation', () => {
    const scores = applyFuzzySenderHeuristic(
      { ...baseRequest, senderName: 'Álvaro' },
      [tx('a', 'alvaro')]
    )
    expect(scores.get('a')).toBe(1.0)
  })

  it('returns 0 from Jaccard when one side has no usable tokens (single-char words)', () => {
    // Both sides have non-empty normalized strings but no tokens longer than 1 char.
    const scores = applyFuzzySenderHeuristic(
      { ...baseRequest, senderName: 'a b c' },
      [tx('a', 'x y z')]
    )
    expect(scores.get('a')).toBe(0)
  })
})
