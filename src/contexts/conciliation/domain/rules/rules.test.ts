import { describe, expect, it } from 'vitest'
import type { CandidateTransaction, RequestData } from '../ConciliationEngine.js'
import { applyDateWindowRule } from './DateWindowRule.js'
import { applyExactAmountRule } from './ExactAmountRule.js'

const tx = (overrides: Partial<CandidateTransaction>): CandidateTransaction => ({
  id: 'tx-1',
  amount: 100,
  currency: 'ARS',
  senderName: 'sender',
  receivedAt: new Date('2024-01-10T00:00:00Z'),
  ...overrides,
})

const request = (overrides: Partial<RequestData> = {}): RequestData => ({
  expectedAmount: 100,
  currency: 'ARS',
  senderName: 'sender',
  createdAt: new Date('2024-01-15T00:00:00Z'),
  ...overrides,
})

describe('applyDateWindowRule', () => {
  it('keeps transactions within the default 5 day window before createdAt', () => {
    const inside = tx({ id: 'in', receivedAt: new Date('2024-01-12T00:00:00Z') })
    const outside = tx({ id: 'out', receivedAt: new Date('2024-01-05T00:00:00Z') })
    expect(applyDateWindowRule(request(), [inside, outside]).map((t) => t.id)).toEqual(['in'])
  })

  it('honors a custom windowDays', () => {
    const inside = tx({ id: 'in', receivedAt: new Date('2024-01-13T00:00:00Z') })
    const outside = tx({ id: 'out', receivedAt: new Date('2024-01-11T00:00:00Z') })
    expect(applyDateWindowRule(request(), [inside, outside], 3).map((t) => t.id)).toEqual(['in'])
  })

  it('returns empty when no candidates match', () => {
    const tooOld = tx({ receivedAt: new Date('2023-12-01T00:00:00Z') })
    expect(applyDateWindowRule(request(), [tooOld])).toEqual([])
  })

  it('rejects transactions received far after createdAt (window is bounded forward too)', () => {
    const future = tx({ id: 'future', receivedAt: new Date('2024-02-01T00:00:00Z') })
    expect(applyDateWindowRule(request(), [future])).toEqual([])
  })

  it('keeps a transaction received shortly after createdAt within the forward window', () => {
    const justAfter = tx({ id: 'after', receivedAt: new Date('2024-01-18T00:00:00Z') })
    expect(applyDateWindowRule(request(), [justAfter]).map((t) => t.id)).toEqual(['after'])
  })
})

describe('applyExactAmountRule', () => {
  it('keeps only candidates with matching amount and currency', () => {
    const ok = tx({ id: 'ok', amount: 100, currency: 'ARS' })
    const wrongAmount = tx({ id: 'wa', amount: 99, currency: 'ARS' })
    const wrongCurrency = tx({ id: 'wc', amount: 100, currency: 'USD' })
    expect(
      applyExactAmountRule(request(), [ok, wrongAmount, wrongCurrency]).map((t) => t.id),
    ).toEqual(['ok'])
  })

  it('returns empty when no candidates match', () => {
    const wrong = tx({ amount: 50 })
    expect(applyExactAmountRule(request({ expectedAmount: 100 }), [wrong])).toEqual([])
  })
})
