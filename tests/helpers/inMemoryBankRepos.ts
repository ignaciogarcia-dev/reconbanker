import { BankTransaction } from '../../src/contexts/banking/domain/BankTransaction.js'
import type { IBankTransactionRepository } from '../../src/contexts/banking/domain/IBankTransactionRepository.js'
import type { IScrapeRunRepository } from '../../src/contexts/banking/domain/IScrapeRunRepository.js'

export class InMemoryBankTransactionRepository implements IBankTransactionRepository {
  store = new Map<string, BankTransaction>()
  excluded = new Set<string>()
  notified = new Set<string>()

  withTx() { return this }

  async findById(id: string) { return this.store.get(id) ?? null }
  async findByExternalId(accountId: string, externalId: string) {
    return [...this.store.values()].find((t) => t.accountId === accountId && t.externalId === externalId) ?? null
  }
  async findLatestExternalId(accountId: string) {
    const txs = [...this.store.values()].filter((t) => t.accountId === accountId)
    if (!txs.length) return null
    txs.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    return txs[0].externalId
  }
  async save(tx: BankTransaction): Promise<boolean> {
    const key = `${tx.accountId}::${tx.externalId}`
    const existing = [...this.store.values()].find((t) => `${t.accountId}::${t.externalId}` === key)
    if (existing) return false
    this.store.set(tx.id, tx)
    return true
  }
  async markExcluded(id: string) { this.excluded.add(id) }
  async isExcluded(id: string) { return this.excluded.has(id) }
  async markNotified(id: string) { this.notified.add(id) }
  async markAllNotified(accountId: string) {
    for (const t of this.store.values()) if (t.accountId === accountId) this.notified.add(t.id)
  }
  async isNotified(id: string) { return this.notified.has(id) }
  async claimNotification(id: string) {
    if (this.notified.has(id)) return false
    this.notified.add(id)
    return true
  }
  async releaseNotification(id: string) { this.notified.delete(id) }
}

export class InMemoryScrapeRunRepository implements IScrapeRunRepository {
  runs: Array<{ runId: string; accountId: string; scriptId: string; status: string; count?: number; error?: string; failureType?: string }> = []
  withTx() { return this }
  async create(runId: string, accountId: string, scriptId: string) {
    this.runs.push({ runId, accountId, scriptId, status: 'running' })
  }
  async markSuccess(runId: string, count: number) {
    const r = this.runs.find((x) => x.runId === runId); if (r) { r.status = 'success'; r.count = count }
  }
  async markFailed(runId: string, error: string, failureType: string = 'unknown') {
    const r = this.runs.find((x) => x.runId === runId); if (r) { r.status = 'failed'; r.error = error; r.failureType = failureType }
  }
}
