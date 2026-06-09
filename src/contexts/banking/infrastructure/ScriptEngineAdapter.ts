import { ScriptLoader } from '../../script-engine/infrastructure/ScriptLoader.js'
import { PlaywrightRunner } from '../../script-engine/infrastructure/PlaywrightRunner.js'
import { ActiveScript, IScriptEnginePort, ScrapedTransaction } from '../domain/IScriptEnginePort.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'

export class ScriptEngineAdapter implements IScriptEnginePort {
  constructor(private readonly logger?: ILogger) {}

  async loadActiveScript(bank: string, flowType: string): Promise<ActiveScript | null> {
    const script = await ScriptLoader.loadActive(bank, flowType as any)
    if (!script || !script.codeSnapshot) return null
    return { id: script.id, codeSnapshot: script.codeSnapshot }
  }

  async runScript(
    script: ActiveScript,
    context: { accountId: string; lastExternalId: string | null }
  ): Promise<ScrapedTransaction[]> {
    // PlaywrightRunner expects a BankScript-like object with codeSnapshot and id
    const runner = new PlaywrightRunner(this.logger)
    return runner.execute({ id: script.id, codeSnapshot: script.codeSnapshot } as any, context)
  }
}
