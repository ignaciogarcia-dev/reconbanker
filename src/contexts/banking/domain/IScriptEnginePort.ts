import type { IStageRecorder } from '../../../shared/domain/scrapeStage.js'

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

// `runId` is the bank_scrape_runs id the caller has already recorded. Required here
// (the use case always has one) so every line a script emits can be tied back to its
// run row without inventing a second identifier.
export interface RunScriptContext {
  accountId: string
  lastExternalId: string | null
  runId: string
  // Lets the harness record the stages around the script body (launch, load_script,
  // credentials, close) — the failures that happen before a script ever runs.
  recorder?: IStageRecorder
}

export interface IScriptEnginePort {
  loadActiveScript(bank: string, flowType: string, accountId: string, userId: string): Promise<ActiveScript | null>
  runScript(script: ActiveScript, context: RunScriptContext): Promise<ScrapedTransaction[]>
}
