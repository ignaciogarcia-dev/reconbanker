import { describe, it, expect } from 'vitest'
import { MatchResult } from './MatchResult.js'

describe('MatchResult', () => {
  it('matched carries the transactionId and candidates', () => {
    const m = MatchResult.matched('tx-1', ['tx-1', 'tx-2'])
    expect(m.status).toBe('matched')
    expect(m.transactionId).toBe('tx-1')
    expect(m.candidateIds).toEqual(['tx-1', 'tx-2'])
  })

  it('notFound has no transactionId and empty candidates', () => {
    const m = MatchResult.notFound()
    expect(m.status).toBe('not_found')
    expect(m.transactionId).toBeUndefined()
    expect(m.candidateIds).toEqual([])
  })

  it('ambiguous keeps the candidate list', () => {
    const m = MatchResult.ambiguous(['a', 'b', 'c'])
    expect(m.status).toBe('ambiguous')
    expect(m.candidateIds).toEqual(['a', 'b', 'c'])
    expect(m.transactionId).toBeUndefined()
  })
})
