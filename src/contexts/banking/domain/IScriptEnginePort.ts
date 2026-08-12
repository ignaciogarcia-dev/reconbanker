export interface ScrapedTransaction {
  externalId: string
  referenceHash: string
  amount: number
  currency: string
  senderName?: string
  receivedAt: Date
  raw: Record<string, unknown>
}

export interface ActiveScript {
  id: string
  codeSnapshot: string
}

export interface IScriptEnginePort {
  loadActiveScript(bank: string, flowType: string, accountId: string, userId: string): Promise<ActiveScript | null>
  runScript(script: ActiveScript, context: { accountId: string; lastExternalId: string | null }): Promise<ScrapedTransaction[]>
}
