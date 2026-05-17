import { BankScript, FlowType } from './BankScript.js'

export interface ScriptListItem {
  id: string
  bank: string
  flowType: string
  version: string
  status: string
  origin: string
  createdAt: Date
}

export interface IBankScriptRepository {
  findActive(bank: string, flowType: FlowType): Promise<BankScript | null>
  findById(id: string): Promise<BankScript | null>
  findAll(): Promise<ScriptListItem[]>
  deprecateActive(bank: string, flowType: FlowType): Promise<void>
  save(script: BankScript): Promise<void>
}
