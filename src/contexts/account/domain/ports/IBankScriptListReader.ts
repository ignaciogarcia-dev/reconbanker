export interface BankScriptSummary {
  id: string
  flowType: string
  version: string
  status: string
  origin: string
  createdAt: Date
}

export interface IBankScriptListReader {
  listForBank(bankId: string): Promise<BankScriptSummary[]>
}
