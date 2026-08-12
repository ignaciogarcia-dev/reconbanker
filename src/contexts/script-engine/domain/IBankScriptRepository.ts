import { BankScript, FlowType } from './BankScript.js'

export interface ScriptListItem {
  id: string
  bank: string
  flowType: string
  version: string
  status: string
  origin: string
  userId: string | null
  createdAt: Date
}

export interface IBankScriptRepository {
  findActive(bank: string, flowType: FlowType): Promise<BankScript | null>
  findById(id: string): Promise<BankScript | null>
  findAll(callerId: string): Promise<ScriptListItem[]>
  deprecateActive(bank: string, flowType: FlowType, accountId: string | null, userId: string | null): Promise<void>
  save(script: BankScript): Promise<void>
}
