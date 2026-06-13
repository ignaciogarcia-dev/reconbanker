import { CandidateTransaction, RequestData } from '../ConciliationEngine.js'

export function applyDateWindowRule(request: RequestData, candidates: CandidateTransaction[], windowDays = 5): CandidateTransaction[] {
  // Bounded on both sides around createdAt: a small backward window absorbs
  // clock skew, and the forward bound stops a request from matching a
  // transaction received arbitrarily far in the future. Millisecond math keeps
  // the window timezone-independent (setDate/getDate would shift by local TZ).
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  const created = request.createdAt.getTime()
  const from = created - windowMs
  const to = created + windowMs
  return candidates.filter(t => {
    const at = t.receivedAt.getTime()
    return at >= from && at <= to
  })
}
