import { CandidateTransaction, RequestData } from '../ConciliationEngine.js'

function normalize(s?: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string): Set<string> {
  return new Set(s.split(' ').filter(t => t.length > 1))
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  const intersection = [...a].filter(t => b.has(t)).length
  const union = new Set([...a, ...b]).size
  return intersection / union
}

export function applyFuzzySenderHeuristic(
  request: RequestData,
  candidates: CandidateTransaction[]
): Map<string, number> {
  const scores = new Map<string, number>()
  const reqNorm = normalize(request.senderName)
  const reqTokens = tokenize(reqNorm)

  for (const t of candidates) {
    const txNorm = normalize(t.senderName)
    const txTokens = tokenize(txNorm)

    if (!reqNorm || !txNorm) {
      scores.set(t.id, 0.5)
      continue
    }

    // Exact match after normalization.
    if (reqNorm === txNorm) {
      scores.set(t.id, 1.0)
      continue
    }

    // Jaccard over tokens — robust to ordering and punctuation.
    const jaccard = jaccardScore(reqTokens, txTokens)

    const substring = txNorm.includes(reqNorm) || reqNorm.includes(txNorm) ? 0.8 : 0

    scores.set(t.id, Math.max(jaccard, substring))
  }

  return scores
}
