import { BankScript, FlowType } from '../../src/contexts/script-engine/domain/BankScript.js'
import type {
  IBankScriptRepository,
  ScriptListItem,
} from '../../src/contexts/script-engine/domain/IBankScriptRepository.js'

export class InMemoryBankScriptRepository implements IBankScriptRepository {
  store = new Map<string, BankScript>()
  withTx() { return this }

  async findActive(bank: string, flowType: FlowType): Promise<BankScript | null> {
    return [...this.store.values()].find(
      (s) => s.bank === bank && s.flowType === flowType && s.status === 'active'
    ) ?? null
  }

  async findById(id: string): Promise<BankScript | null> {
    return this.store.get(id) ?? null
  }

  async findAll(callerId: string): Promise<ScriptListItem[]> {
    return [...this.store.values()]
      .filter((s) => s.userId == null || s.userId === callerId)
      .map((s) => ({
        id: s.id, bank: s.bank, flowType: s.flowType, version: s.version,
        status: s.status, origin: s.origin, userId: s.userId ?? null, createdAt: s.createdAt,
      }))
  }

  async deprecateActive(bank: string, flowType: FlowType, accountId: string | null, userId: string | null): Promise<void> {
    const active = [...this.store.values()].find(
      (s) => s.bank === bank && s.flowType === flowType && s.status === 'active'
        && (s.accountId ?? null) === accountId && (s.userId ?? null) === userId
    )
    if (active) active.deprecate()
  }

  async save(script: BankScript): Promise<void> {
    this.store.set(script.id, script)
  }
}
