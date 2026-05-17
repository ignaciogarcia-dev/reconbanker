import crypto from 'crypto'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import { NotFoundError } from '../../../shared/errors/index.js'
import { ScrapeRunFailedEvent } from '../../../shared/events/events/ScrapeRunFailed.event.js'
import { BankTransaction } from '../domain/BankTransaction.js'
import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'
import { IScriptEnginePort } from '../domain/IScriptEnginePort.js'
import { IScrapeRunRepository } from '../domain/IScrapeRunRepository.js'
import { IAccountForBankingReader } from '../domain/ports/IAccountForBankingReader.js'

interface JobData { accountId: string }

export interface RunBankScrapeDeps {
  accountReader: IAccountForBankingReader
  txRepo: IBankTransactionRepository
  scrapeRunRepo: IScrapeRunRepository
  scriptEngine: IScriptEnginePort
  eventBus: IEventBus
}

export class RunBankScrapeUseCase {
  constructor(private readonly deps: RunBankScrapeDeps) {}

  async execute({ accountId }: JobData): Promise<void> {
    const { accountReader, txRepo, scrapeRunRepo, scriptEngine, eventBus } = this.deps

    const account = await accountReader.findById(accountId)
    if (!account) throw new NotFoundError(`Account ${accountId} not found`)

    const lastExternalId = await txRepo.findLatestExternalId(accountId)

    const script = await scriptEngine.loadActiveScript(account.bank, 'extract_transactions')
    if (!script) throw new NotFoundError(`No active script for ${account.bank}:extract_transactions`)

    const runId = crypto.randomUUID()
    await scrapeRunRepo.create(runId, accountId, script.id)

    try {
      const transactions = await scriptEngine.runScript(script, { accountId, lastExternalId })

      for (const tx of transactions) {
        const exists = await txRepo.findByExternalId(accountId, tx.externalId)
        if (exists) continue

        const bankTx = BankTransaction.create(crypto.randomUUID(), {
          accountId,
          externalId: tx.externalId,
          referenceHash: tx.referenceHash,
          amount: tx.amount,
          currency: tx.currency,
          senderName: tx.senderName,
          receivedAt: tx.receivedAt,
          scriptId: script.id,
          rawPayload: tx.raw,
        })
        await txRepo.save(bankTx)
        await eventBus.publishAll(bankTx.domainEvents)
        bankTx.clearDomainEvents()
      }

      await scrapeRunRepo.markSuccess(runId, transactions.length)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await scrapeRunRepo.markFailed(runId, message)
      await eventBus.publish(
        new ScrapeRunFailedEvent(runId, accountId, script.id, 'unknown', message)
      )
      throw err
    }
  }
}
