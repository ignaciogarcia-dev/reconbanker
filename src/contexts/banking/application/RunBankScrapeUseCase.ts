import crypto from 'crypto'
import { NotFoundError } from '../../../shared/errors/index.js'
import { withTimeout } from '../../../shared/util/withTimeout.js'
import { ILogger } from '../../../shared/logger/ILogger.js'
import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'
import { IScriptEnginePort } from '../domain/IScriptEnginePort.js'
import { IScrapeRunRepository } from '../domain/IScrapeRunRepository.js'
import { IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'
import { IScrapeFailureNotifier } from '../domain/ports/IScrapeFailureNotifier.js'
import { categorizeFailure } from '../domain/scrapeFailure.js'
import { IngestTransactionsUseCase } from './IngestTransactionsUseCase.js'

interface JobData { accountId: string }

// Fallback when the composition root does not inject runTimeoutMs (env is read there).
const DEFAULT_RUN_TIMEOUT_MS = 13 * 60_000

export interface RunBankScrapeDeps {
  accountReader: IAccountForBankingReader
  txRepo: IBankTransactionRepository
  scrapeRunRepo: IScrapeRunRepository
  scriptEngine: IScriptEnginePort
  ingest: IngestTransactionsUseCase
  logger?: ILogger
  ensureSession?: (accountId: string) => Promise<void>
  runTimeoutMs?: number
  notifier?: IScrapeFailureNotifier
}

export class RunBankScrapeUseCase {
  constructor(private readonly deps: RunBankScrapeDeps) {}

  async execute({ accountId }: JobData): Promise<void> {
    const { accountReader, txRepo, scrapeRunRepo, scriptEngine, ingest, logger } = this.deps

    const account = await accountReader.findById(accountId)
    if (!account) throw new NotFoundError(`Account ${accountId} not found`)

    if (account.sessionType === 'persistent') {
      if (this.deps.ensureSession) await this.deps.ensureSession(accountId)
      return
    }

    const lastExternalId = await txRepo.findLatestExternalId(accountId)

    const script = await scriptEngine.loadActiveScript(account.bank, 'extract_transactions', account.id, account.userId)
    if (!script) throw new NotFoundError(`No active script for ${account.bank}:extract_transactions`)

    const runId = crypto.randomUUID()
    await scrapeRunRepo.create(runId, accountId, script.id)

    try {
      const transactions = await withTimeout(
        scriptEngine.runScript(script, { accountId, lastExternalId, runId }),
        this.deps.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
        `bank scrape ${account.bank}`,
      )
      const saved = await ingest.execute(accountId, script.id, transactions)
      await scrapeRunRepo.markSuccess(runId, saved)
      await this.deps.notifier?.recordSuccess({ userId: account.userId, accountId })
    } catch (err) {
      // Expected scrape failures (login, missing selector, timeout) are recorded in
      // bank_scrape_runs and logged, but do NOT abort the job: the scheduler retries
      // on its next cycle. Only genuine misconfiguration (missing account/script)
      // throws — those happen before this try and surface as a failed job.
      const message = err instanceof Error ? err.message : String(err)
      const category = categorizeFailure(err)
      await scrapeRunRepo.markFailed(runId, message, category)
      await this.deps.notifier?.recordFailure({ userId: account.userId, accountId, category })
      logger?.warn('bank scrape run failed', { accountId, runId, scriptId: script.id, category, error: message })
    }
  }
}
