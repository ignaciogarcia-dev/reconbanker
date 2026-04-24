import { MatchResult } from './MatchResult.js'
import { applyExactAmountRule } from './rules/ExactAmountRule.js'
import { applyDateWindowRule } from './rules/DateWindowRule.js'
import { applyFuzzySenderHeuristic } from './heuristics/FuzzySenderHeuristic.js'

export interface CandidateTransaction {
  id: string
  amount: number
  currency: string
  senderName?: string
  receivedAt: Date
}

export interface RequestData {
  expectedAmount: number
  currency: string
  senderName?: string
  createdAt: Date
}

export class ConciliationEngine {
  evaluate(request: RequestData, candidates: CandidateTransaction[]): MatchResult {
    let filtered = applyExactAmountRule(request, candidates)
    filtered = applyDateWindowRule(request, filtered)

    if (filtered.length === 0) return MatchResult.notFound()

    const scores = applyFuzzySenderHeuristic(request, filtered)
    const sorted = [...filtered].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    const top = sorted[0]
    const topScore = scores.get(top.id) ?? 0

    // Score 0 = no name overlap → not a match.
    if (topScore === 0) return MatchResult.notFound()

    const withScore = sorted.filter(t => (scores.get(t.id) ?? 0) > 0)
    if (withScore.length > 1) return MatchResult.ambiguous(withScore.map(t => t.id))

    return MatchResult.matched(top.id, sorted.map(t => t.id))
  }
}
