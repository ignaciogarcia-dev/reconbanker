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

  async findAll(): Promise<ScriptListItem[]> {
    return [...this.store.values()].map((s) => ({
      id: s.id, bank: s.bank, flowType: s.flowType, version: s.version,
      status: s.status, origin: s.origin, createdAt: s.createdAt,
    }))
  }

  async deprecateActive(bank: string, flowType: FlowType): Promise<void> {
    const active = await this.findActive(bank, flowType)
    if (active) active.deprecate()
  }

  async save(script: BankScript): Promise<void> {
    this.store.set(script.id, script)
  }
}
