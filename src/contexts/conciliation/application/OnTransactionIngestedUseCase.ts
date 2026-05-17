import { IConciliationRequestRepository } from '../domain/IConciliationRequestRepository.js'
import { IBankTransactionFinder } from '../domain/ports/IBankTransactionFinder.js'
import { TransactionIngestedEvent } from '../../../shared/events/events/TransactionIngested.event.js'
import type { ILogger } from '../../../shared/logger/ILogger.js'

export interface OnTransactionIngestedDeps {
  requestRepo: IConciliationRequestRepository
  bankTransactionFinder: IBankTransactionFinder
  enqueueProcess: (transactionId: string) => Promise<void>
  logger?: ILogger
}

export class OnTransactionIngestedUseCase {
  constructor(private readonly deps: OnTransactionIngestedDeps) {}

  async execute(event: TransactionIngestedEvent): Promise<void> {
    const { requestRepo, bankTransactionFinder, enqueueProcess, logger } = this.deps
    const txId = event.aggregateId

    const hasActive = await requestRepo.hasActiveRequests(event.accountId)
    if (!hasActive) {
      await bankTransactionFinder.markExcluded(txId)
      logger?.info('tx excluded — no active requests', { txId })
      return
    }

    await enqueueProcess(txId)
    logger?.info('tx enqueued for tx-conciliation', { txId })
  }
}
