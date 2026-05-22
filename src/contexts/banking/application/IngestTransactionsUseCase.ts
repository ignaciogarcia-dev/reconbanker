import crypto from 'crypto'
import { IEventBus } from '../../../shared/events/IEventBus.js'
import { BankTransaction } from '../domain/BankTransaction.js'
import { IBankTransactionRepository } from '../domain/IBankTransactionRepository.js'
import { ScrapedTransaction } from '../domain/IScriptEnginePort.js'

export interface IngestTransactionsDeps {
  txRepo: IBankTransactionRepository
  eventBus: IEventBus
}

/**
 * Deduplicates a batch of scraped transactions by externalId, persists the new
 * ones, and publishes their domain events. Shared by the one-shot scrape path
 * and the persistent monitor's onTransactions callback. Returns how many were
 * actually saved (i.e. were new).
 */
export class IngestTransactionsUseCase {
  constructor(private readonly deps: IngestTransactionsDeps) {}

  async execute(accountId: string, scriptId: string, transactions: ScrapedTransaction[]): Promise<number> {
    const { txRepo, eventBus } = this.deps
    let saved = 0

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
        scriptId,
        rawPayload: tx.raw,
      })
      await txRepo.save(bankTx)
      await eventBus.publishAll(bankTx.domainEvents)
      bankTx.clearDomainEvents()
      saved += 1
    }

    return saved
  }
}
