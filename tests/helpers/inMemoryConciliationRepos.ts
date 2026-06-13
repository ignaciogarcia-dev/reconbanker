import { ConciliationRequest } from '../../src/contexts/conciliation/domain/ConciliationRequest.js'
import {
  IConciliationRequestRepository,
  StaleRequestRef,
} from '../../src/contexts/conciliation/domain/IConciliationRequestRepository.js'
import {
  ConciliatedTransactionData,
  IConciliatedTransactionRepository,
  PrimaryMatchRef,
} from '../../src/contexts/conciliation/domain/IConciliatedTransactionRepository.js'
import {
  ConciliationAttemptData,
  IConciliationAttemptRepository,
} from '../../src/contexts/conciliation/domain/IConciliationAttemptRepository.js'

export class InMemoryConciliationRequestRepository implements IConciliationRequestRepository {
  store = new Map<string, ConciliationRequest>()
  withTx() { return this }
  async findById(id: string) { return this.store.get(id) ?? null }
  async findByIdForUpdate(id: string) { return this.store.get(id) ?? null }
  async findActiveExternalIds(accountId: string) {
    const set = new Set<string>()
    for (const r of this.store.values()) {
      if (r.accountId === accountId && !['cancelled', 'expired'].includes(r.status)) {
        set.add(r.externalId)
      }
    }
    return set
  }
  async findPendingByAccount(accountId: string) {
    return [...this.store.values()].filter(
      (r) => r.accountId === accountId && ['pending', 'not_found'].includes(r.status)
    )
  }
  async findStale(olderThan: Date): Promise<StaleRequestRef[]> {
    return [...this.store.values()]
      .filter((r) => ['pending', 'not_found'].includes(r.status) && r.createdAt <= olderThan)
      .map((r) => ({ id: r.id, accountId: r.accountId }))
  }
  async hasActiveRequests(accountId: string) {
    return [...this.store.values()].some(
      (r) => r.accountId === accountId && ['pending', 'not_found'].includes(r.status)
    )
  }
  async save(request: ConciliationRequest) { this.store.set(request.id, request) }
  async createIfAbsent(request: ConciliationRequest): Promise<boolean> {
    const exists = [...this.store.values()].some(
      (r) => r.accountId === request.accountId && r.externalId === request.externalId
    )
    if (exists) return false
    this.store.set(request.id, request)
    return true
  }
  async cancelMissing(accountId: string, presentExternalIds: string[]) {
    let count = 0
    for (const r of this.store.values()) {
      if (
        r.accountId === accountId &&
        ['pending', 'processing', 'not_found', 'ambiguous', 'failed'].includes(r.status) &&
        !presentExternalIds.includes(r.externalId)
      ) {
        r.markCancelled()
        count++
      }
    }
    return count
  }
}

export class InMemoryConciliatedTransactionRepository implements IConciliatedTransactionRepository {
  matches: ConciliatedTransactionData[] = []
  notified = new Set<string>()
  withTx() { return this }
  async save(m: ConciliatedTransactionData) { this.matches.push(m) }
  async findPrimaryByRequest(requestId: string): Promise<PrimaryMatchRef | null> {
    const m = this.matches.find((x) => x.requestId === requestId)
    return m ? { id: m.id } : null
  }
  async markNotified(matchId: string) { this.notified.add(matchId) }
}

export class InMemoryConciliationAttemptRepository implements IConciliationAttemptRepository {
  attempts: ConciliationAttemptData[] = []
  withTx() { return this }
  async save(a: ConciliationAttemptData) { this.attempts.push(a) }
}
