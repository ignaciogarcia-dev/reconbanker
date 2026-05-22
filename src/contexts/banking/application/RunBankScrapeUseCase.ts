import crypto from 'crypto'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import { ScrapeRunFailedEvent } from '../../../shared/events/events/ScrapeRunFailed.event.js'
import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'
import { IScriptEnginePort } from '../domain/IScriptEnginePort.js'
import { IScrapeRunRepository } from '../domain/IScrapeRunRepository.js'
import { IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'
import { IAccountScrapeBlocker } from '../domain/ports/IAccountScrapeBlocker.js'
import { isFatalScrapeError } from '../domain/isFatalScrapeError.js'
import { IngestTransactionsUseCase } from './IngestTransactionsUseCase.js'

interface JobData { accountId: string }

export interface RunBankScrapeDeps {
  accountReader: IAccountForBankingReader
  txRepo: IBankTransactionRepository
  scrapeRunRepo: IScrapeRunRepository
  scriptEngine: IScriptEnginePort
  eventBus: IEventBus
  ingest: IngestTransactionsUseCase
  blocker: IAccountScrapeBlocker
  ensureSession?: (accountId: string) => Promise<void>
}

export class RunBankScrapeUseCase {
  constructor(private readonly deps: RunBankScrapeDeps) {}

  async execute({ accountId }: JobData): Promise<void> {
    const { accountReader, txRepo, scrapeRunRepo, scriptEngine, eventBus, ingest, blocker } = this.deps

    const account = await accountReader.findById(accountId)
    if (!account) throw new NotFoundError(`Account ${accountId} not found`)

    if (account.sessionType === 'persistent') {
      if (this.deps.ensureSession) await this.deps.ensureSession(accountId)
      return
    }

    const lastExternalId = await txRepo.findLatestExternalId(accountId)

    const script = await scriptEngine.loadActiveScript(account.bank, 'extract_transactions')
    if (!script) throw new NotFoundError(`No active script for ${account.bank}:extract_transactions`)

    const runId = crypto.randomUUID()
    await scrapeRunRepo.create(runId, accountId, script.id)

    try {
      const transactions = await scriptEngine.runScript(script, { accountId, lastExternalId })
      const saved = await ingest.execute(accountId, script.id, transactions)
      await scrapeRunRepo.markSuccess(runId, saved)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const fatal = isFatalScrapeError(message)
      const failureType = fatal ? 'login_failed' : 'unknown'
      await scrapeRunRepo.markFailed(runId, message, failureType)
      if (fatal) await blocker.block(accountId, message)
      await eventBus.publish(
        new ScrapeRunFailedEvent(runId, accountId, script.id, failureType, message)
      )
      throw err
    }
  }
}
